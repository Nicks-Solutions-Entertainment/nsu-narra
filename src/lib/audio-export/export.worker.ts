/// <reference lib="webworker" />
import { encodeFlac } from './flac';
import { encodeMp3 } from './mp3';

/**
 * Worker dos codificadores em JavaScript puro (FLAC e MP3): textos longos
 * levam alguns segundos e travariam a interface no thread principal.
 * O resultado volta como ArrayBuffer transferido (sem cópia).
 */

declare const self: DedicatedWorkerGlobalScope;

export interface ExportRequest {
  id: number;
  format: 'flac' | 'mp3';
  samples: Int16Array;
  sampleRate: number;
}

export type ExportResponse = { id: number; bytes: ArrayBuffer } | { id: number; error: string };

self.onmessage = ({ data: { id, format, samples, sampleRate } }: MessageEvent<ExportRequest>) => {
  try {
    const out = format === 'flac' ? encodeFlac(samples, sampleRate) : encodeMp3(samples, sampleRate);
    const bytes = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
    self.postMessage({ id, bytes } satisfies ExportResponse, [bytes]);
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies ExportResponse);
  }
};
