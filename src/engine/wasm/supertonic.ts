import { SUPERTONIC_FILES } from '../catalog';
import { DEFAULT_STEPS, STEPS_RANGE } from '../tuning';
import { pcmToWav } from '../wav';
import { ORT_BASE_URL } from './ort-paths';
import { setNextVocabulary } from './phoneme-guard';
import ort from './ort-runtime';
import { SPEECH_PACE } from './speech-pace';

/**
 * Motor Supertonic 3 (atrás de `FEATURES.supertonic`), executado no worker.
 *
 * Porta do exemplo web oficial (supertone-oss-archive/supertonic, MIT), sem
 * os arrays aninhados dele: tensores ficam em `Float32Array` do início ao fim.
 *
 * Pipeline por trecho:
 *  1. texto normalizado (NFKD) com tag de idioma `<pt>…</pt>` → ids por
 *     ponto de código (`unicode_indexer.json`); não há G2P/espeak;
 *  2. `duration_predictor` → duração total, dividida pela velocidade;
 *  3. `text_encoder` → embedding do texto com o estilo da voz;
 *  4. ruído gaussiano refinado por `vector_estimator` em N passos (flow
 *     matching): mais passos = mais qualidade e mais tempo;
 *  5. `vocoder` → amostras a 44,1 kHz → WAV 16-bit.
 *
 * Os quatro modelos somam ~400 MB; o worker mantém só uma família carregada.
 */

/** Silêncio entre trechos, como o `silence_duration` do SDK. */
export const GAP_SECONDS = 0.3;

/** Velocidade padrão do modelo (SDK), desacelerada pelo ritmo do app. */
const BASE_SPEED = 1.05 / SPEECH_PACE;
/** Faixa aceita pelo modelo segundo o SDK. */
const MIN_SPEED = 0.7;
const MAX_SPEED = 2;

type Session = Awaited<ReturnType<typeof ort.InferenceSession.create>>;
type Tensor = InstanceType<typeof ort.Tensor>;

interface Config {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { latent_dim: number; chunk_compress_factor: number };
}

/** Estilo de uma voz: tensores prontos para as sessões. */
export interface SupertonicStyle {
  ttl: Tensor;
  dp: Tensor;
}

interface RawTensor {
  dims: number[];
  data: unknown[];
}

/** Lê um arquivo salvo (o worker resolve no OPFS). */
type ReadFile = (name: string) => Promise<Blob>;

export class SupertonicEngine {
  private constructor(
    private readonly cfg: Config,
    private readonly indexer: number[],
    private readonly dp: Session,
    private readonly encoder: Session,
    private readonly estimator: Session,
    private readonly vocoder: Session,
  ) {}

  /**
   * Carrega config, indexador e os quatro modelos, um de cada vez, para o
   * pico de memória ser um modelo em bytes + as sessões já criadas.
   */
  static async load(read: ReadFile): Promise<SupertonicEngine> {
    ort.env.wasm.wasmPaths = ORT_BASE_URL;
    ort.env.wasm.numThreads = navigator.hardwareConcurrency;
    setNextVocabulary(null); // o filtro de fonemas é só para modelos Piper

    const json = async <T,>(name: string) => JSON.parse(await (await read(name)).text()) as T;
    const session = async (name: string) =>
      ort.InferenceSession.create(new Uint8Array(await (await read(name)).arrayBuffer()), {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });

    const cfg = await json<Config>(SUPERTONIC_FILES.tts);
    const indexer = await json<number[]>(SUPERTONIC_FILES.unicode_indexer);
    const dp = await session(SUPERTONIC_FILES.duration_predictor);
    const encoder = await session(SUPERTONIC_FILES.text_encoder);
    const estimator = await session(SUPERTONIC_FILES.vector_estimator);
    const vocoder = await session(SUPERTONIC_FILES.vocoder);
    return new SupertonicEngine(cfg, indexer, dp, encoder, estimator, vocoder);
  }

  /** Converte o JSON de estilo da voz (`<id>.json`) em tensores. */
  static parseStyle(text: string): SupertonicStyle {
    const raw = JSON.parse(text) as { style_ttl: RawTensor; style_dp: RawTensor };
    const tensor = (t: RawTensor) => new ort.Tensor('float32', Float32Array.from(t.data.flat(Infinity) as number[]), t.dims);
    return { ttl: tensor(raw.style_ttl), dp: tensor(raw.style_dp) };
  }

  /**
   * Gera um trecho de texto.
   * @param steps Passos de refinamento (qualidade × tempo).
   * @param speed Multiplicador do ritmo do app (1 = normal).
   * @returns WAV PCM 16-bit mono a 44,1 kHz.
   */
  async synthesize(
    text: string,
    style: SupertonicStyle,
    lang: string,
    steps = DEFAULT_STEPS,
    speed = 1,
  ): Promise<ArrayBuffer> {
    const ids = this.tokenize(normalize(text, lang));
    if (ids.length === 0) throw new Error('O texto não contém caracteres suportados por esta voz.');

    const totalSteps = Math.round(clamp(steps, STEPS_RANGE.min, STEPS_RANGE.max));
    const textIds = new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]);
    const textMask = new ort.Tensor('float32', new Float32Array(ids.length).fill(1), [1, 1, ids.length]);

    const { duration } = await this.dp.run({ text_ids: textIds, style_dp: style.dp, text_mask: textMask });
    const seconds = (duration.data as Float32Array)[0] / clamp(BASE_SPEED * speed, MIN_SPEED, MAX_SPEED);
    const { text_emb: textEmb } = await this.encoder.run({ text_ids: textIds, style_ttl: style.ttl, text_mask: textMask });

    // Latente inicial: ruído gaussiano com um quadro a cada `chunk` amostras.
    const { sample_rate: sampleRate, base_chunk_size: baseChunk } = this.cfg.ae;
    const { latent_dim: latentDim, chunk_compress_factor: compress } = this.cfg.ttl;
    const wavLen = Math.floor(seconds * sampleRate);
    const frames = Math.max(1, Math.ceil(wavLen / (baseChunk * compress)));
    const dims = [1, latentDim * compress, frames];
    let latent = gaussian(dims[1] * frames);
    const latentMask = new ort.Tensor('float32', new Float32Array(frames).fill(1), [1, 1, frames]);
    const total = new ort.Tensor('float32', [totalSteps], [1]);

    for (let step = 0; step < totalSteps; step++) {
      const out = await this.estimator.run({
        noisy_latent: new ort.Tensor('float32', latent, dims),
        text_emb: textEmb,
        style_ttl: style.ttl,
        latent_mask: latentMask,
        text_mask: textMask,
        current_step: new ort.Tensor('float32', [step], [1]),
        total_step: total,
      });
      latent = out.denoised_latent.data as Float32Array;
    }

    const { wav_tts: wav } = await this.vocoder.run({ latent: new ort.Tensor('float32', latent, dims) });
    const samples = wav.data as Float32Array;
    return pcmToWav(samples.subarray(0, Math.min(wavLen, samples.length)), sampleRate);
  }

  /** Libera a memória dos quatro modelos (WASM). */
  async release(): Promise<void> {
    await Promise.all([this.dp, this.encoder, this.estimator, this.vocoder].map((s) => s.release()));
  }

  /** Pontos de código → ids; caracteres fora do vocabulário são descartados. */
  private tokenize(text: string): number[] {
    const ids: number[] = [];
    for (const ch of text) {
      const id = this.indexer[ch.codePointAt(0) ?? 0];
      if (id !== undefined && id >= 0) ids.push(id);
    }
    return ids;
  }
}

/** Trocas de símbolos do pré-processamento oficial (as de inglês ficaram de fora). */
const REPLACEMENTS: [RegExp, string][] = [
  [/[–‑—]/g, '-'],
  [/[_[\]|\/#→←]/g, ' '],
  [/[“”]/g, '"'],
  [/[‘’´`]/g, "'"],
  [/[♥☆♡©\\]/g, ''],
  [/@/g, ' arroba '],
  [/\p{Extended_Pictographic}/gu, ''],
  [/ ([,.!?;:'])/g, '$1'],
  [/(["'])\1+/g, '$1'],
  [/\s+/g, ' '],
];

/**
 * Normalização do exemplo oficial: NFKD, símbolos simplificados, ponto final
 * quando falta pontuação e a tag do idioma em volta do texto.
 */
function normalize(text: string, lang: string): string {
  let out = REPLACEMENTS.reduce((t, [re, to]) => t.replace(re, to), text.normalize('NFKD')).trim();
  if (!/[.!?;:,'")\]}…»]$/.test(out)) out += '.';
  return `<${lang}>${out}</${lang}>`;
}

/** Ruído normal padrão (Box–Muller). */
function gaussian(length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 2) {
    const r = Math.sqrt(-2 * Math.log(Math.max(1e-4, Math.random())));
    const theta = 2 * Math.PI * Math.random();
    out[i] = r * Math.cos(theta);
    if (i + 1 < length) out[i + 1] = r * Math.sin(theta);
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
