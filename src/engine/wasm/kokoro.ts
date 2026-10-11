import createPiperPhonemize from '@diffusionstudio/piper-wasm/build/piper_phonemize.js';
import { WASM_BASE } from '@mintplex-labs/piper-tts-web';
import vocab from '../catalog/kokoro-vocab.json';
import { KOKORO_MODEL } from '../catalog';
import { pcmToWav } from '../wav';
import { ORT_BASE_URL } from './ort-paths';
import { setNextVocabulary } from './phoneme-guard';
import ort from './ort-runtime';
import { SPEECH_PACE } from './speech-pace';

/**
 * Motor Kokoro-82M (atrás de `FEATURES.kokoro`), executado dentro do worker.
 *
 * Pipeline por trecho (igual ao `kokoro-js`, com o G2P de pt-BR do misaki):
 *  1. espeak-ng (WASM do piper-phonemize, que já traz pt-br) → fonemas IPA;
 *  2. junção dos pares que o misaki funde (tʃ→ʧ, aʊ→W…);
 *  3. fonemas → ids pelo vocabulário do Kokoro, com `$` (0) nas pontas;
 *  4. estilo = linha `nº de tokens` do vetor da voz (510×256);
 *  5. ONNX → amostras float a 24 kHz → WAV 16-bit.
 *
 * Usa o mesmo onnxruntime 1.18 do Piper (testado no spike) e mantém só um
 * modelo carregado; o worker libera a sessão ao voltar para uma voz Piper.
 */

const VOCAB = vocab as Record<string, number>;
const STYLE_DIM = 256;
/** Contexto do modelo: 512 tokens, incluindo os dois `$`. */
const MAX_TOKENS = 510;

/** Pares fundidos pelo misaki (espeak com tie `^`) — sem os ajustes só de inglês. */
const E2M: [string, string][] = [
  ['aɪ', 'I'], ['aʊ', 'W'], ['dz', 'ʣ'], ['dʒ', 'ʤ'], ['eɪ', 'A'],
  ['oʊ', 'O'], ['əʊ', 'Q'], ['ts', 'ʦ'], ['tʃ', 'ʧ'], ['ɔɪ', 'Y'],
];

type Session = Awaited<ReturnType<typeof ort.InferenceSession.create>>;

export class KokoroEngine {
  private constructor(private readonly session: Session) {}

  /** Carrega o modelo a partir do arquivo salvo no OPFS. */
  static async load(model: Blob): Promise<KokoroEngine> {
    ort.env.wasm.wasmPaths = ORT_BASE_URL;
    ort.env.wasm.numThreads = navigator.hardwareConcurrency;
    setNextVocabulary(null); // o filtro de fonemas é só para modelos Piper
    const session = await ort.InferenceSession.create(new Uint8Array(await model.arrayBuffer()), {
      executionProviders: ['wasm'],
    });
    return new KokoroEngine(session);
  }

  /**
   * Gera um trecho de texto com o estilo de uma voz.
   * @param styles Vetor da voz (`<id>.bin`, Float32 510×256).
   * @returns WAV PCM 16-bit mono a 24 kHz.
   */
  async synthesize(text: string, styles: Float32Array, espeakVoice: string): Promise<ArrayBuffer> {
    const ids = tokenize(await phonemize(text, espeakVoice));
    if (ids.length === 0) throw new Error('O texto não contém sons suportados por esta voz.');

    const tokens = [0, ...ids.slice(0, MAX_TOKENS), 0];
    const row = Math.min(Math.max(tokens.length - 2, 0), MAX_TOKENS - 1) * STYLE_DIM;
    const { waveform } = await this.session.run({
      input_ids: new ort.Tensor('int64', BigInt64Array.from(tokens, BigInt), [1, tokens.length]),
      style: new ort.Tensor('float32', styles.slice(row, row + STYLE_DIM), [1, STYLE_DIM]),
      speed: new ort.Tensor('float32', [1 / SPEECH_PACE], [1]),
    });
    return pcmToWav(waveform.data as Float32Array, KOKORO_MODEL.sampleRate);
  }

  /** Libera a memória do modelo (WASM). */
  async release(): Promise<void> {
    await this.session.release();
  }
}

/** Fonemas IPA do espeak-ng, no formato do misaki (pares fundidos). */
function phonemize(text: string, voice: string): Promise<string> {
  return new Promise((resolve, reject) => {
    createPiperPhonemize({
      print: (data: string) => {
        const phonemes = (JSON.parse(data).phonemes as string[]).flat().join('').trim();
        resolve(E2M.reduce((ps, [from, to]) => ps.split(from).join(to), phonemes).replace(/-/g, ''));
      },
      printErr: (message: string) => reject(new Error(message)),
      locateFile: (url: string) => (url.endsWith('.wasm') ? `${WASM_BASE}.wasm` : `${WASM_BASE}.data`),
    })
      .then((module: { callMain(args: string[]): void }) =>
        module.callMain(['-l', voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']),
      )
      .catch(reject);
  });
}

/** Fonemas → ids do vocabulário do Kokoro (símbolos desconhecidos são ignorados). */
function tokenize(phonemes: string): number[] {
  const ids: number[] = [];
  for (const ch of phonemes) {
    const id = VOCAB[ch];
    if (id !== undefined) ids.push(id);
  }
  return ids;
}
