/**
 * Taxas dos formatos com perda (módulo leve, sem os codificadores, para a UI
 * estimar tamanhos sem baixar o LAME).
 */

/** Opus: transparente para voz mono. */
export const OPUS_KBPS = 64;

/**
 * MP3 para voz mono: 64 kbps nas vozes de 16–24 kHz (MPEG-2) e 96 kbps nas
 * de 44,1 kHz — sem perda audível para fala.
 */
export function mp3Kbps(sampleRate: number): number {
  return sampleRate <= 24000 ? 64 : 96;
}
