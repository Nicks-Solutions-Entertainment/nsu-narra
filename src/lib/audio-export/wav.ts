/** Áudio PCM mono extraído de um WAV. */
export interface Pcm {
  samples: Int16Array;
  sampleRate: number;
}

/**
 * Lê um WAV PCM 16-bit mono procurando os blocos `fmt ` e `data` (aceita o
 * cabeçalho canônico de 44 bytes gerado pelo app e WAVs com blocos extras).
 */
export function readWav(buffer: ArrayBuffer): Pcm {
  const view = new DataView(buffer);
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Arquivo WAV inválido.');

  let sampleRate = 0;
  for (let offset = 12; offset + 8 <= buffer.byteLength; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      const channels = view.getUint16(body + 2, true);
      const bits = view.getUint16(body + 14, true);
      if (view.getUint16(body, true) !== 1 || channels !== 1 || bits !== 16) {
        throw new Error('Só WAV PCM 16-bit mono é suportado.');
      }
      sampleRate = view.getUint32(body + 4, true);
    } else if (id === 'data') {
      const bytes = Math.min(size, buffer.byteLength - body) & ~1;
      // Cópia alinhada: o bloco pode começar em offset ímpar em WAVs de fora.
      const samples = new Int16Array(buffer.slice(body, body + bytes));
      if (!sampleRate) throw new Error('WAV sem bloco de formato.');
      return { samples, sampleRate };
    }
    offset = body + size + (size & 1);
  }
  throw new Error('WAV sem áudio.');
}
