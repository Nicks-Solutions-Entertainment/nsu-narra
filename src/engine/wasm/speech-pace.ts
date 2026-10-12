/**
 * Ritmo da fala nos motores do navegador.
 *
 * Os modelos, no padrão, falam rápido demais para narração. `SPEECH_PACE`
 * alonga a duração dos fonemas: 1 = padrão do modelo, 1.2 = 20% mais lento.
 *
 * Manter em sincronia com `LENGTH_SCALE` em `src-tauri/src/services/piper.rs`
 * e `scripts/samples/generate_samples.py` (amostras de prévia).
 */
export const SPEECH_PACE = 1.2;

/**
 * Velocidade do próximo trecho Piper (1 = `SPEECH_PACE` puro), definida pelo
 * worker antes de cada `predict`. É global porque a biblioteca não aceita
 * parâmetros de síntese; a geração é sequencial, então não há disputa.
 */
let piperSpeed = 1;

export function setPiperSpeed(speed: number): void {
  piperSpeed = speed > 0 ? speed : 1;
}

type Ort = typeof import('onnxruntime-web');
type Session = Awaited<ReturnType<Ort['InferenceSession']['create']>>;
type Feeds = Record<string, InstanceType<Ort['Tensor']>>;

/**
 * Devolve uma cópia do módulo `ort` cujas sessões aplicam `SPEECH_PACE` (e a
 * velocidade do trecho, `setPiperSpeed`) nos modelos Piper. A biblioteca piper-tts-web lê o `length_scale` da voz e o
 * envia no tensor `scales` = [noise_scale, length_scale, noise_w]; aqui ele é
 * multiplicado antes da inferência. Sessões sem `scales` (Kokoro) não mudam.
 */
export function withSpeechPace(ort: Ort): Ort {
  const originalCreate = ort.InferenceSession.create as (...args: unknown[]) => Promise<Session>;
  const create = async (...args: unknown[]) => {
    const session = await originalCreate(...args);
    const run = session.run.bind(session);
    session.run = ((feeds: Feeds, ...rest: unknown[]) => {
      const scales = feeds.scales;
      if (scales?.type === 'float32' && scales.data.length === 3) {
        const [noise, length, noiseW] = scales.data as Float32Array;
        feeds = { ...feeds, scales: new ort.Tensor('float32', [noise, (length * SPEECH_PACE) / piperSpeed, noiseW]) };
      }
      return (run as (...a: unknown[]) => ReturnType<Session['run']>)(feeds, ...rest);
    }) as Session['run'];
    return session;
  };

  return { ...ort, InferenceSession: { ...ort.InferenceSession, create } } as Ort;
}
