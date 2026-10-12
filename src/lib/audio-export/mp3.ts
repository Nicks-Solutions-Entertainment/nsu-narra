import { Mp3Encoder } from '@breezystack/lamejs';
import { mp3Kbps } from './bitrates';

/** Amostras por chamada ao codificador (múltiplo do frame MP3 de 1152). */
const CHUNK = 1152 * 20;

/** Codifica PCM 16-bit mono em MP3 (LAME em JavaScript, LGPL). */
export function encodeMp3(samples: Int16Array, sampleRate: number): Uint8Array {
  const encoder = new Mp3Encoder(1, sampleRate, mp3Kbps(sampleRate));
  const parts: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += CHUNK) {
    const out = encoder.encodeBuffer(samples.subarray(i, i + CHUNK));
    if (out.length) parts.push(out);
  }
  parts.push(encoder.flush());
  return concat(parts);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
