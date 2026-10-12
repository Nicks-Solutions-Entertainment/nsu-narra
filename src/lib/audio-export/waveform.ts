import { readWav } from './wav';

/** Picos já calculados por áudio (o Blob é imutável; some junto com ele). */
const cache = new WeakMap<Blob, Promise<Float32Array>>();

/**
 * Forma de onda para o player: `bars` alturas entre 0 e 1, uma por fatia do
 * áudio. Usa o RMS de cada fatia (mais fiel à "massa" da fala que o pico) com
 * raiz quadrada, para trechos baixos continuarem visíveis, e normaliza pelo
 * maior valor. Custo: uma passada pelas amostras (≈50 ms para 20 min).
 */
export function waveformPeaks(wav: Blob, bars: number): Promise<Float32Array> {
  let peaks = cache.get(wav);
  if (!peaks) {
    peaks = wav.arrayBuffer().then((buffer) => computePeaks(readWav(buffer).samples, bars));
    cache.set(wav, peaks);
  }
  return peaks;
}

function computePeaks(samples: Int16Array, bars: number): Float32Array {
  const out = new Float32Array(bars);
  const size = samples.length / bars;
  let max = 0;
  for (let b = 0; b < bars; b++) {
    const start = Math.floor(b * size);
    const end = Math.max(start + 1, Math.floor((b + 1) * size));
    let sum = 0;
    for (let i = start; i < end && i < samples.length; i++) sum += samples[i] * samples[i];
    out[b] = Math.sqrt(Math.sqrt(sum / (end - start)) / 32768);
    if (out[b] > max) max = out[b];
  }
  if (max > 0) for (let b = 0; b < bars; b++) out[b] /= max;
  return out;
}
