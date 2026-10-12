/// <reference lib="webworker" />
import { PATH_MAP, TtsSession, WASM_BASE } from '@mintplex-labs/piper-tts-web';
import { FEATURES } from '@/config/features';
import { splitSentences } from '../chunk';
import { AbortError, type VoiceFamily } from '../types';
import { concatWav } from '../wav';
import { ORT_BASE_URL } from './ort-paths';
import { chunkSpeeds } from '../tuning';
import { setNextVocabulary } from './phoneme-guard';
import { setPiperSpeed } from './speech-pace';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { KokoroEngine } from './kokoro';
import type { SupertonicEngine, SupertonicStyle } from './supertonic';
import { type CatalogEntry, findVoice, getCatalog } from './voice-catalog';
import {
  downloadVoice,
  isInstalled,
  listFiles,
  missingBytes,
  modelFile,
  readFile,
  readVoiceConfig,
  removeVoice,
} from './voice-store';

/**
 * Web Worker que executa todo o trabalho pesado do motor WASM:
 * catálogo, downloads para o OPFS e inferência ONNX.
 *
 * Por que um worker: a inferência do Piper leva de centenas de ms a vários
 * segundos por trecho. No thread principal isso congelaria a interface.
 */

declare const self: DedicatedWorkerGlobalScope;

/** Tamanho máximo de trecho enviado ao modelo por vez. */
const MAX_CHUNK_LEN = 300;

/**
 * Onde buscar os binários WASM: onnxruntime servido pelo próprio app
 * (`public/ort/`, mesma versão do JS) e piper-phonemize do CDN padrão da lib.
 */
const WASM_PATHS = {
  onnxWasm: ORT_BASE_URL,
  piperData: `${WASM_BASE}.data`,
  piperWasm: `${WASM_BASE}.wasm`,
};

/** Controladores de cancelamento por id de requisição. */
const controllers = new Map<number, AbortController>();

/** Sessão Piper carregada (uma voz por vez, para limitar memória). */
let session: { voiceId: string; ready: Promise<TtsSession> } | null = null;

/** Motor Kokoro carregado (o modelo é o mesmo para todas as vozes Kokoro). */
let kokoro: Promise<KokoroEngine> | null = null;
/** Vetores de estilo já lidos, por voz (~0,5 MB cada). */
const kokoroStyles = new Map<string, Float32Array>();

/** Motor Supertonic carregado (quatro modelos compartilhados por todas as vozes). */
let supertonic: Promise<SupertonicEngine> | null = null;
/** Estilos Supertonic já lidos, por voz (~0,3 MB de JSON cada). */
const supertonicStyles = new Map<string, SupertonicStyle>();

/** Ajustes de síntese repassados da UI (ver `SynthesizeOptions`). */
interface Tuning {
  steps?: number;
  speed?: number;
  variation?: number;
}

/** Gera um trecho (WAV) numa velocidade e diz quanto silêncio pôr entre os trechos. */
interface ChunkGenerator {
  generate: (text: string, speed: number) => Promise<ArrayBuffer>;
  gapSeconds: number;
}

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

/**
 * Retorna a sessão da voz pedida, carregando o modelo se necessário.
 *
 * Desempenho: a sessão é reutilizada entre gerações da mesma voz, então só a
 * primeira geração paga o custo de carregar o runtime e o modelo.
 *
 * Contornos da biblioteca:
 *  - `TtsSession` é um singleton que NÃO recarrega o modelo quando `voiceId`
 *    muda; por isso zeramos `_instance` ao trocar de voz.
 *  - Ela ignora a tabela de fonemas da voz; registramos o vocabulário do
 *    modelo para o filtro de `phoneme-guard.ts` (vozes antigas como Edresson).
 *  - Ela só conhece as vozes do seu `PATH_MAP` e busca o modelo no OPFS pelo
 *    último segmento do caminho. Registrando `<id>.onnx` para a voz, ela lê
 *    os arquivos que nós baixamos — inclusive vozes novas e da comunidade.
 */
function getSession(voiceId: string): Promise<TtsSession> {
  if (session?.voiceId === voiceId) return session.ready;

  void releaseKokoro(); // um modelo por vez na memória
  void releaseSupertonic();
  TtsSession._instance = null;
  const ready = readVoiceConfig<Parameters<typeof setNextVocabulary>[0]>(voiceId).then((config) => {
    // Sem a voz no OPFS a lib tentaria baixar de outro repositório e gravaria
    // a página de erro como modelo; por isso exigimos a instalação antes.
    if (!config) throw new Error('Esta voz não está instalada. Baixe-a antes de gerar.');
    setNextVocabulary(config);
    (PATH_MAP as Record<string, string>)[voiceId] = `local/${modelFile(voiceId)}`;
    return TtsSession.create({ voiceId: voiceId as TtsSession['voiceId'], wasmPaths: WASM_PATHS });
  });
  session = { voiceId, ready };
  ready.catch(() => {
    if (session?.ready === ready) session = null; // permite nova tentativa
  });
  return ready;
}

/**
 * Retorna o motor Kokoro, carregando o modelo compartilhado na 1ª vez.
 * O código do Kokoro só é baixado aqui (import dinâmico) e só existe no
 * bundle com `FEATURES.kokoro` ligada.
 */
function getKokoro(voice: CatalogEntry): Promise<KokoroEngine> {
  if (!FEATURES.kokoro) return Promise.reject(new Error('Vozes Kokoro desativadas neste build.'));
  if (kokoro) return kokoro;

  // Um modelo por vez: descarta as outras famílias antes de carregar o Kokoro.
  session = null;
  TtsSession._instance = null;
  void releaseSupertonic();

  const modelName = voice.files.find((f) => f.shared)?.name ?? '';
  const ready = Promise.all([loadKokoroModule(), readFile(modelName)]).then(([mod, model]) => {
    if (!model) throw new Error('Esta voz não está instalada. Baixe-a antes de gerar.');
    return mod.KokoroEngine.load(model);
  });
  kokoro = ready;
  ready.catch(() => {
    if (kokoro === ready) kokoro = null;
  });
  return ready;
}

/**
 * Import do motor Kokoro. A condição fica escrita aqui (e não via `FEATURES`)
 * para o bundler avaliá-la no build e nem gerar o chunk com a flag desligada.
 */
function loadKokoroModule(): Promise<typeof import('./kokoro')> {
  return process.env.NEXT_PUBLIC_FEATURE_KOKORO !== 'off'
    ? import('./kokoro')
    : Promise.reject(new Error('Vozes Kokoro desativadas neste build.'));
}

/** Vetor de estilo da voz Kokoro (lido do OPFS uma vez). */
async function getKokoroStyle(voice: CatalogEntry): Promise<Float32Array> {
  const cached = kokoroStyles.get(voice.id);
  if (cached) return cached;
  const name = voice.files.find((f) => !f.shared)?.name ?? '';
  const file = await readFile(name);
  if (!file) throw new Error('Esta voz não está instalada. Baixe-a antes de gerar.');
  const styles = new Float32Array(await file.arrayBuffer());
  kokoroStyles.set(voice.id, styles);
  return styles;
}

/**
 * Retorna o motor Supertonic, carregando os quatro modelos na 1ª vez.
 * Como o Kokoro, só existe no bundle com a flag ligada.
 */
function getSupertonic(): Promise<SupertonicEngine> {
  if (!FEATURES.supertonic) return Promise.reject(new Error('Vozes Supertonic desativadas neste build.'));
  if (supertonic) return supertonic;

  // ~400 MB: solta as outras famílias antes de carregar.
  session = null;
  TtsSession._instance = null;
  void releaseKokoro();

  const ready = loadSupertonicModule().then((mod) => mod.SupertonicEngine.load(readInstalled));
  supertonic = ready;
  ready.catch(() => {
    if (supertonic === ready) supertonic = null;
  });
  return ready;
}

/** Import do motor Supertonic, avaliado no build (ver `loadKokoroModule`). */
function loadSupertonicModule(): Promise<typeof import('./supertonic')> {
  return process.env.NEXT_PUBLIC_FEATURE_SUPERTONIC !== 'off'
    ? import('./supertonic')
    : Promise.reject(new Error('Vozes Supertonic desativadas neste build.'));
}

/** Estilo da voz Supertonic (lido do OPFS uma vez). */
async function getSupertonicStyle(voice: CatalogEntry): Promise<SupertonicStyle> {
  const cached = supertonicStyles.get(voice.id);
  if (cached) return cached;
  const [mod, file] = await Promise.all([loadSupertonicModule(), readInstalled(voice.files.at(-1)?.name ?? '')]);
  const style = mod.SupertonicEngine.parseStyle(await file.text());
  supertonicStyles.set(voice.id, style);
  return style;
}

/** Solta os modelos Supertonic da memória (WASM). */
async function releaseSupertonic(): Promise<void> {
  const current = supertonic;
  supertonic = null;
  supertonicStyles.clear();
  const engine = await current?.catch(() => null);
  await engine?.release();
}

/** Lê um arquivo salvo, exigindo que exista. */
async function readInstalled(name: string): Promise<File> {
  const file = await readFile(name);
  if (!file) throw new Error('Esta voz não está instalada. Baixe-a antes de gerar.');
  return file;
}

/** Solta o modelo Kokoro da memória (WASM). */
async function releaseKokoro(): Promise<void> {
  const current = kokoro;
  kokoro = null;
  kokoroStyles.clear();
  const engine = await current?.catch(() => null);
  await engine?.release();
}

/**
 * Lista o catálogo com o estado de instalação atual e o que falta baixar.
 * Arquivos e URLs ficam no worker (a UI não precisa deles).
 */
async function handleListVoices(families?: VoiceFamily[]) {
  const [catalog, files] = await Promise.all([getCatalog(families), listFiles()]);
  return catalog.map((entry) => {
    const { files: voiceFiles, espeakVoice, modelLang, ...voice } = entry;
    void voiceFiles;
    void espeakVoice;
    void modelLang;
    const installed = isInstalled(entry, files);
    return { ...voice, installed, downloadBytes: installed ? 0 : missingBytes(entry, files) };
  });
}

/**
 * Baixa uma voz e reporta progresso em bytes.
 * Throttle: só envia mensagem quando o percentual inteiro muda, evitando
 * milhares de `postMessage` (e re-renderizações) por download.
 */
async function handleDownload(id: number, voiceId: string, signal: AbortSignal) {
  const voice = await findVoice(voiceId);
  let lastPct = -1;
  await downloadVoice(
    voice,
    (loaded, total) => {
      const pct = total ? Math.min(100, Math.floor((loaded / total) * 100)) : 0;
      if (pct === lastPct) return;
      lastPct = pct;
      post({ id, kind: 'progress', done: Math.min(loaded, total), total });
    },
    signal,
  );
  return null;
}

/**
 * Remove a voz do OPFS e descarta o que estiver carregado dela.
 * Arquivos compartilhados (modelos Kokoro e Supertonic) só saem quando nenhuma outra voz
 * instalada os usa.
 */
async function handleRemove(voiceId: string) {
  const voice = await findVoice(voiceId);
  if (session?.voiceId === voiceId) {
    session = null;
    TtsSession._instance = null;
  }
  kokoroStyles.delete(voiceId);
  supertonicStyles.delete(voiceId);

  const [catalog, files] = await Promise.all([getCatalog(), listFiles()]);
  const keep = new Set(
    catalog
      .filter((v) => v.id !== voiceId && isInstalled(v, files))
      .flatMap((v) => v.files.filter((f) => f.shared).map((f) => f.name)),
  );
  // O modelo compartilhado vai sair do disco: solta da memória também.
  if (!voice.files.some((f) => f.shared && keep.has(f.name))) {
    if (voice.family === 'kokoro') await releaseKokoro();
    if (voice.family === 'supertonic') await releaseSupertonic();
  }
  await removeVoice(voice, keep);
  return null;
}

/**
 * Gera o áudio trecho a trecho e devolve um único WAV.
 *
 * - Cancelamento verificado entre trechos.
 * - O ArrayBuffer final é transferido (zero-copy) para o thread da UI.
 */
async function handleSynthesize(id: number, text: string, voiceId: string, tuning: Tuning, signal: AbortSignal) {
  const chunks = splitSentences(text, MAX_CHUNK_LEN);
  if (chunks.length === 0) throw new Error('Digite algum texto para gerar o áudio.');

  const voice = await findVoice(voiceId);
  const { generate, gapSeconds } = await chunkGenerator(voice, tuning);
  // Variação de ritmo entre trechos em torno da velocidade escolhida (média = base).
  const speeds = chunkSpeeds(tuning.speed ?? 1, chunks.length, tuning.variation);
  const parts: ArrayBuffer[] = [];
  post({ id, kind: 'progress', done: 0, total: chunks.length });

  for (let i = 0; i < chunks.length; i++) {
    if (signal.aborted) throw new AbortError('Geração cancelada.');
    parts.push(await generate(chunks[i], speeds[i]));
    post({ id, kind: 'progress', done: i + 1, total: chunks.length });
  }

  return concatWav(parts, gapSeconds);
}

/** Gerador de trechos com o motor da família da voz. */
async function chunkGenerator(voice: CatalogEntry, { steps }: Tuning): Promise<ChunkGenerator> {
  if (voice.family === 'supertonic') {
    const [engine, style, mod] = await Promise.all([getSupertonic(), getSupertonicStyle(voice), loadSupertonicModule()]);
    const lang = voice.modelLang ?? 'pt';
    return { generate: (text, speed) => engine.synthesize(text, style, lang, steps, speed), gapSeconds: mod.GAP_SECONDS };
  }
  if (voice.family === 'kokoro') {
    const [engine, styles] = await Promise.all([getKokoro(voice), getKokoroStyle(voice)]);
    const espeak = voice.espeakVoice ?? 'pt-br';
    return { generate: (text, speed) => engine.synthesize(text, styles, espeak, speed), gapSeconds: 0 };
  }
  const tts = await getSession(voice.id);
  return {
    generate: async (text, speed) => {
      setPiperSpeed(speed);
      return (await tts.predict(text)).arrayBuffer();
    },
    gapSeconds: 0,
  };
}

/** Roteia cada requisição para o handler correspondente. */
async function dispatch(req: Exclude<WorkerRequest, { op: 'cancel' }>, signal: AbortSignal) {
  switch (req.op) {
    case 'listVoices':
      return handleListVoices(req.params.families);
    case 'download':
      return handleDownload(req.id, req.params.voiceId, signal);
    case 'remove':
      return handleRemove(req.params.voiceId);
    case 'synthesize':
      return handleSynthesize(req.id, req.params.text, req.params.voiceId, req.params, signal);
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  if (req.op === 'cancel') {
    controllers.get(req.params.targetId)?.abort();
    return;
  }

  const controller = new AbortController();
  controllers.set(req.id, controller);
  try {
    const result = await dispatch(req, controller.signal);
    post({ id: req.id, kind: 'result', result }, result instanceof ArrayBuffer ? [result] : []);
  } catch (err) {
    const aborted = controller.signal.aborted || (err instanceof Error && err.name === 'AbortError');
    const message = err instanceof Error ? err.message : String(err);
    post({ id: req.id, kind: 'error', message, aborted });
  } finally {
    controllers.delete(req.id);
  }
};
