import { OPUS_KBPS } from './bitrates';
import type { Pcm } from './wav';

/**
 * OGG Opus no navegador: o codificador Opus nativo (WebCodecs `AudioEncoder`)
 * gera os pacotes e este módulo os empacota em páginas OGG (RFC 7845).
 * Sem dependências; roda no thread da UI porque a codificação já acontece
 * fora dele (o `AudioEncoder` é assíncrono e nativo).
 */

/**
 * Taxa de entrada do codificador. Tudo é reamostrado para 48 kHz (a taxa
 * interna do Opus): com 24 kHz direto, o atraso do codificador muda e o
 * `pre-skip` padrão deixaria o áudio ~3 ms deslocado.
 */
const OPUS_RATE = 48000;
/** Atraso padrão do libopus a 48 kHz, se o navegador não informar. */
const DEFAULT_PRE_SKIP = 312;
/** Amostras por `AudioData` enviado ao codificador. */
const FEED = 48000;
/** Tamanho máximo dos dados de uma página antes de fechá-la. */
const PAGE_BYTES = 4000;

const encoderConfig = (sampleRate: number): AudioEncoderConfig => ({
  codec: 'opus',
  sampleRate,
  numberOfChannels: 1,
  bitrate: OPUS_KBPS * 1000,
});

/** O navegador codifica Opus? (WebCodecs; Chrome, Edge e versões recentes de Firefox e Safari). */
export async function canEncodeOpus(): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined') return false;
  try {
    return (await AudioEncoder.isConfigSupported(encoderConfig(OPUS_RATE))).supported === true;
  } catch {
    return false;
  }
}

/** Codifica PCM 16-bit mono em um arquivo `.ogg` (Opus). */
export async function encodeOggOpus({ samples, sampleRate }: Pcm): Promise<Uint8Array> {
  const input = toFloat(samples);
  const rate = OPUS_RATE;
  const pcm = sampleRate === rate ? input : await resample(input, sampleRate, rate);

  const packets: { data: Uint8Array; samples48k: number }[] = [];
  let preSkip = DEFAULT_PRE_SKIP;
  let failure: unknown = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      packets.push({ data, samples48k: Math.round(((chunk.duration ?? 20000) * 48) / 1000) });
      const head = meta?.decoderConfig?.description;
      if (head) preSkip = readPreSkip(head) ?? preSkip;
    },
    error: (e) => (failure = e),
  });
  encoder.configure(encoderConfig(rate));
  for (let i = 0; i < pcm.length; i += FEED) {
    const frames = pcm.subarray(i, i + FEED);
    const data = new AudioData({
      format: 'f32',
      sampleRate: rate,
      numberOfFrames: frames.length,
      numberOfChannels: 1,
      timestamp: Math.round((i / rate) * 1e6),
      data: frames.slice(),
    });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure instanceof Error ? failure : new Error(String(failure));

  // Duração real a 48 kHz: o último granule corta o enchimento do codificador.
  const total48k = preSkip + Math.round((samples.length * 48000) / sampleRate);
  return muxOgg(packets, preSkip, sampleRate, total48k);
}

function toFloat(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] / 32768;
  return out;
}

/** Reamostragem nativa (e de boa qualidade) do Web Audio. */
async function resample(input: Float32Array, from: number, to: number): Promise<Float32Array> {
  const length = Math.ceil((input.length * to) / from);
  const ctx = new OfflineAudioContext(1, length, to);
  const buffer = ctx.createBuffer(1, input.length, from);
  buffer.copyToChannel(input as Float32Array<ArrayBuffer>, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  return (await ctx.startRendering()).getChannelData(0);
}

/** `pre-skip` de um cabeçalho OpusHead (se o navegador fornecer um). */
function readPreSkip(description: AllowSharedBufferSource): number | null {
  const bytes = ArrayBuffer.isView(description)
    ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
    : new Uint8Array(description);
  if (bytes.length < 19 || String.fromCharCode(...bytes.subarray(0, 8)) !== 'OpusHead') return null;
  return bytes[10] | (bytes[11] << 8);
}

/** Monta o arquivo OGG: OpusHead, OpusTags e os pacotes de áudio. */
function muxOgg(
  packets: { data: Uint8Array; samples48k: number }[],
  preSkip: number,
  inputRate: number,
  total48k: number,
): Uint8Array {
  const serial = (Math.random() * 0xffffffff) >>> 0;
  const pages: Uint8Array[] = [];
  let sequence = 0;
  const page = (data: Uint8Array[], granule: number, flags: number) =>
    pages.push(oggPage(data, granule, serial, sequence++, flags));

  const head = new Uint8Array(19);
  const hv = new DataView(head.buffer);
  head.set(utf8('OpusHead'));
  head[8] = 1; // versão
  head[9] = 1; // canais
  hv.setUint16(10, preSkip, true);
  hv.setUint32(12, inputRate, true);
  page([head], 0, 0x02); // início do fluxo

  const vendor = utf8('Narra');
  const comment = utf8('COMMENT=Áudio gerado por IA (Narra)');
  const tags = new Uint8Array(8 + 4 + vendor.length + 4 + 4 + comment.length);
  const tv = new DataView(tags.buffer);
  tags.set(utf8('OpusTags'));
  tv.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  tv.setUint32(12 + vendor.length, 1, true);
  tv.setUint32(16 + vendor.length, comment.length, true);
  tags.set(comment, 20 + vendor.length);
  page([tags], 0, 0);

  let granule = preSkip;
  let batch: Uint8Array[] = [];
  let batchBytes = 0;
  let segments = 0;
  packets.forEach((p, i) => {
    batch.push(p.data);
    batchBytes += p.data.length;
    segments += Math.floor(p.data.length / 255) + 1;
    granule += p.samples48k;
    const last = i === packets.length - 1;
    const next = packets[i + 1];
    const full = !last && (batchBytes >= PAGE_BYTES || segments + Math.floor(next.data.length / 255) + 1 > 255);
    if (last || full) {
      page(batch, last ? Math.min(granule, total48k) : granule, last ? 0x04 : 0);
      batch = [];
      batchBytes = 0;
      segments = 0;
    }
  });
  if (packets.length === 0) page([], preSkip, 0x04);

  const out = new Uint8Array(pages.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of pages) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Uma página OGG com pacotes completos (cada um termina com segmento < 255). */
function oggPage(packets: Uint8Array[], granule: number, serial: number, sequence: number, flags: number): Uint8Array {
  const lacing: number[] = [];
  for (const p of packets) {
    for (let n = p.length; ; n -= 255) {
      lacing.push(Math.min(n, 255));
      if (n < 255) break;
    }
  }
  const bodyBytes = packets.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + bodyBytes);
  const view = new DataView(out.buffer);
  out.set(utf8('OggS'));
  out[5] = flags;
  view.setUint32(6, granule >>> 0, true);
  view.setUint32(10, Math.floor(granule / 2 ** 32), true);
  view.setUint32(14, serial, true);
  view.setUint32(18, sequence, true);
  out[26] = lacing.length;
  out.set(lacing, 27);
  let offset = 27 + lacing.length;
  for (const p of packets) {
    out.set(p, offset);
    offset += p.length;
  }
  view.setUint32(22, oggCrc(out), true);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 24;
    for (let b = 0; b < 8; b++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** CRC-32 do OGG (polinômio 0x04C11DB7, sem reflexão, campo do CRC zerado). */
function oggCrc(data: Uint8Array): number {
  let c = 0;
  for (const b of data) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ b) & 0xff]) >>> 0;
  return c;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
