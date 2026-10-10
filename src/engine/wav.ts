/** Tamanho do cabeçalho RIFF/WAVE canônico gerado pelo Piper. */
const WAV_HEADER_BYTES = 44;

/**
 * Junta vários WAVs PCM 16-bit com o mesmo formato em um único WAV.
 *
 * Desempenho: aloca o buffer de saída uma única vez e copia cada trecho
 * com `Uint8Array.set` (cópia nativa), sem concatenações intermediárias.
 * Recebe `ArrayBuffer`s para evitar reler Blobs.
 *
 * @param parts WAVs completos (com cabeçalho de 44 bytes).
 * @returns Um ArrayBuffer WAV com o cabeçalho do primeiro trecho e tamanhos corrigidos.
 */
export function concatWav(parts: ArrayBuffer[]): ArrayBuffer {
  if (parts.length === 0) throw new Error('Nenhum áudio para juntar.');
  if (parts.length === 1) return parts[0];

  const dataBytes = parts.reduce((n, p) => n + (p.byteLength - WAV_HEADER_BYTES), 0);
  const out = new Uint8Array(WAV_HEADER_BYTES + dataBytes);
  out.set(new Uint8Array(parts[0], 0, WAV_HEADER_BYTES), 0);

  let offset = WAV_HEADER_BYTES;
  for (const p of parts) {
    out.set(new Uint8Array(p, WAV_HEADER_BYTES), offset);
    offset += p.byteLength - WAV_HEADER_BYTES;
  }

  const view = new DataView(out.buffer);
  view.setUint32(4, 36 + dataBytes, true); // tamanho do chunk RIFF
  view.setUint32(40, dataBytes, true); // tamanho do chunk "data"
  return out.buffer;
}

/**
 * Converte amostras float (-1..1, mono) em WAV PCM 16-bit com cabeçalho de
 * 44 bytes — o mesmo formato do Piper, para `concatWav` funcionar igual.
 * Desempenho: uma alocação e um laço sobre as amostras.
 */
export function pcmToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const view = new DataView(new ArrayBuffer(WAV_HEADER_BYTES + dataBytes));
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // tamanho do bloco fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes por segundo
  view.setUint16(32, 2, true); // bytes por amostra
  view.setUint16(34, 16, true); // bits por amostra
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0, p = WAV_HEADER_BYTES; i < samples.length; i++, p += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return view.buffer;
}

/** Empacota bytes WAV em um Blob reproduzível pelo `<audio>`. */
export function wavBlob(bytes: ArrayBuffer | Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: 'audio/wav' });
}
