/// <reference lib="webworker" />
import { TtsSession } from '@mintplex-labs/piper-tts-web';
import { splitSentences } from '../chunk';
import { AbortError } from '../types';
import { concatWav } from '../wav';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { getCatalog } from './voice-catalog';
import { downloadVoice, listInstalled, removeVoice } from './voice-store';

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

/** Controladores de cancelamento por id de requisição. */
const controllers = new Map<number, AbortController>();

/** Sessão ONNX carregada (uma voz por vez, para limitar memória). */
let session: { voiceId: string; ready: Promise<TtsSession> } | null = null;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

/**
 * Retorna a sessão da voz pedida, carregando o modelo se necessário.
 *
 * Desempenho: a sessão é reutilizada entre gerações da mesma voz, então só a
 * primeira geração paga o custo de carregar o runtime e o modelo.
 *
 * Contorno: `TtsSession` é um singleton que NÃO recarrega o modelo quando
 * `voiceId` muda; por isso zeramos `_instance` ao trocar de voz.
 */
function getSession(voiceId: string): Promise<TtsSession> {
  if (session?.voiceId === voiceId) return session.ready;

  TtsSession._instance = null;
  const ready = TtsSession.create({ voiceId: voiceId as TtsSession['voiceId'] });
  session = { voiceId, ready };
  ready.catch(() => {
    if (session?.ready === ready) session = null; // permite nova tentativa
  });
  return ready;
}

/** Lista o catálogo do idioma alvo com o estado de instalação atual. */
async function handleListVoices() {
  const [catalog, installed] = await Promise.all([getCatalog(), listInstalled()]);
  return catalog.map((v) => ({ ...v, installed: installed.has(v.id) }));
}

/**
 * Baixa uma voz e reporta progresso em bytes.
 * Throttle: só envia mensagem quando o percentual inteiro muda, evitando
 * milhares de `postMessage` (e re-renderizações) por download.
 */
async function handleDownload(id: number, voiceId: string, signal: AbortSignal) {
  let lastPct = -1;
  await downloadVoice(
    voiceId,
    (loaded, total) => {
      const pct = total ? Math.floor((loaded / total) * 100) : 0;
      if (pct === lastPct) return;
      lastPct = pct;
      post({ id, kind: 'progress', done: loaded, total });
    },
    signal,
  );
  return null;
}

/** Remove a voz do OPFS e descarta a sessão se ela estiver carregada. */
async function handleRemove(voiceId: string) {
  if (session?.voiceId === voiceId) {
    session = null;
    TtsSession._instance = null;
  }
  await removeVoice(voiceId);
  return null;
}

/**
 * Gera o áudio trecho a trecho e devolve um único WAV.
 *
 * - Cancelamento verificado entre trechos.
 * - O ArrayBuffer final é transferido (zero-copy) para o thread da UI.
 */
async function handleSynthesize(id: number, text: string, voiceId: string, signal: AbortSignal) {
  const chunks = splitSentences(text, MAX_CHUNK_LEN);
  if (chunks.length === 0) throw new Error('Digite algum texto para gerar o áudio.');

  const tts = await getSession(voiceId);
  const parts: ArrayBuffer[] = [];
  post({ id, kind: 'progress', done: 0, total: chunks.length });

  for (let i = 0; i < chunks.length; i++) {
    if (signal.aborted) throw new AbortError('Geração cancelada.');
    const wav = await tts.predict(chunks[i]);
    parts.push(await wav.arrayBuffer());
    post({ id, kind: 'progress', done: i + 1, total: chunks.length });
  }

  return concatWav(parts);
}

/** Roteia cada requisição para o handler correspondente. */
async function dispatch(req: Exclude<WorkerRequest, { op: 'cancel' }>, signal: AbortSignal) {
  switch (req.op) {
    case 'listVoices':
      return handleListVoices();
    case 'download':
      return handleDownload(req.id, req.params.voiceId, signal);
    case 'remove':
      return handleRemove(req.params.voiceId);
    case 'synthesize':
      return handleSynthesize(req.id, req.params.text, req.params.voiceId, signal);
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
