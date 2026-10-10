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

/** Empacota bytes WAV em um Blob reproduzível pelo `<audio>`. */
export function wavBlob(bytes: ArrayBuffer | Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: 'audio/wav' });
}
