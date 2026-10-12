import type { ExportRequest, ExportResponse } from './export.worker';
import { mp3Kbps, OPUS_KBPS } from './bitrates';
import { readWav } from './wav';

/**
 * Conversão do WAV gerado para os formatos do menu de download, feita no
 * aparelho e só no clique (o player continua tocando o WAV original).
 *
 *  - OGG Opus: codificador nativo do navegador (WebCodecs) + empacotador próprio;
 *  - MP3: LAME em JavaScript (LGPL), num worker;
 *  - FLAC: codificador próprio, sem perda, num worker;
 *  - WAV: o próprio arquivo.
 *
 * Cada codificador só é baixado quando o formato é escolhido (import dinâmico).
 */

export type ExportFormat = 'ogg' | 'mp3' | 'flac' | 'wav';

export interface ExportFormatInfo {
  format: ExportFormat;
  label: string;
  /** Para que serve, em poucas palavras. */
  note: string;
  recommended?: boolean;
  /** Tamanho estimado em bytes. */
  estimate: (audio: { sizeBytes: number; durationSec: number; sampleRate: number }) => number;
}

/** Formatos na ordem do menu. */
export const EXPORT_FORMATS: readonly ExportFormatInfo[] = [
  {
    format: 'ogg',
    label: 'OGG',
    note: `Opus ${OPUS_KBPS} kbps · menor arquivo, qualidade transparente para voz`,
    recommended: true,
    estimate: ({ durationSec }) => (durationSec * OPUS_KBPS * 1000) / 8,
  },
  {
    format: 'mp3',
    label: 'MP3',
    note: 'compatível com qualquer player',
    estimate: ({ durationSec, sampleRate }) => (durationSec * mp3Kbps(sampleRate) * 1000) / 8,
  },
  {
    format: 'flac',
    label: 'FLAC',
    note: 'sem perda, ~60% menor que o WAV',
    estimate: ({ sizeBytes }) => sizeBytes * 0.4,
  },
  {
    format: 'wav',
    label: 'WAV',
    note: 'original, sem compressão',
    estimate: ({ sizeBytes }) => sizeBytes,
  },
];

const MIME: Record<ExportFormat, string> = {
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
};

/** Formatos que este navegador consegue gerar (OGG depende do WebCodecs). */
export async function supportedFormats(): Promise<Set<ExportFormat>> {
  const { canEncodeOpus } = await import('./ogg-opus');
  const formats = new Set<ExportFormat>(['mp3', 'flac', 'wav']);
  if (await canEncodeOpus()) formats.add('ogg');
  return formats;
}

/** Converte o WAV gerado para o formato pedido. */
export async function exportAudio(wav: Blob, format: ExportFormat): Promise<Blob> {
  if (format === 'wav') return wav;
  const pcm = readWav(await wav.arrayBuffer());
  const bytes =
    format === 'ogg'
      ? await (await import('./ogg-opus')).encodeOggOpus(pcm)
      : await runWorker({ format, samples: pcm.samples, sampleRate: pcm.sampleRate });
  return new Blob([bytes as BlobPart], { type: MIME[format] });
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (b: ArrayBuffer) => void; reject: (e: Error) => void }>();

/** Envia o PCM ao worker de codificação (criado na primeira conversão). */
function runWorker(req: Omit<ExportRequest, 'id'>): Promise<ArrayBuffer> {
  if (!worker) {
    const w = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<ExportResponse>) => {
      const p = pending.get(data.id);
      pending.delete(data.id);
      if ('bytes' in data) p?.resolve(data.bytes);
      else p?.reject(new Error(data.error));
    };
    w.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Falha ao converter o áudio.'));
      pending.clear();
      w.terminate();
      if (worker === w) worker = null;
    };
    worker = w;
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, ...req } satisfies ExportRequest, [req.samples.buffer]);
  });
}
