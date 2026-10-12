/**
 * Codificador FLAC mínimo para PCM 16-bit mono (sem perda).
 *
 * Por frame de 4096 amostras: escolhe o melhor preditor fixo (ordem 0–4) e
 * codifica o resíduo em Rice particionado. Para voz isso já reduz ~40–50% do
 * WAV, sem dependências. Não usa LPC (que comprimiria um pouco mais) nem
 * calcula o MD5 do STREAMINFO (zero = "não calculado", permitido pelo formato).
 *
 * Desempenho: O(n) por ordem testada; o parâmetro Rice é estimado pela média
 * do resíduo e só os vizinhos são testados.
 */

const BLOCK_SIZE = 4096;
const MAX_ORDER = 4;
const MAX_PARTITION_ORDER = 4;
const MAX_RICE = 14; // 15 é o código de escape

/** Codifica amostras Int16 mono em um arquivo `.flac`. */
export function encodeFlac(samples: Int16Array, sampleRate: number): Uint8Array {
  const out = new BitWriter(64 + samples.length); // ~1 byte/amostra no pior caso típico
  out.bytes([0x66, 0x4c, 0x61, 0x43]); // "fLaC"

  // METADATA_BLOCK_HEADER: último bloco, tipo 0 (STREAMINFO), 34 bytes.
  out.bits(1, 1);
  out.bits(0, 7);
  out.bits(34, 24);
  out.bits(BLOCK_SIZE, 16); // menor bloco
  out.bits(BLOCK_SIZE, 16); // maior bloco
  out.bits(0, 24); // menor frame (desconhecido)
  out.bits(0, 24); // maior frame (desconhecido)
  out.bits(sampleRate, 20);
  out.bits(0, 3); // canais - 1
  out.bits(15, 5); // bits por amostra - 1
  out.bits(Math.floor(samples.length / 2 ** 32), 4);
  out.bits(samples.length >>> 0, 32);
  for (let i = 0; i < 16; i++) out.bits(0, 8); // MD5 não calculado

  const residual = new Int32Array(BLOCK_SIZE);
  for (let start = 0, frame = 0; start < samples.length; start += BLOCK_SIZE, frame++) {
    writeFrame(out, samples.subarray(start, start + BLOCK_SIZE), frame, residual);
  }
  return out.finish();
}

function writeFrame(out: BitWriter, block: Int16Array, frameNumber: number, residual: Int32Array): void {
  const frameStart = out.byteLength();

  // Cabeçalho do frame.
  out.bits(0b11111111111110, 14); // sincronismo
  out.bits(0, 1); // reservado
  out.bits(0, 1); // tamanho de bloco fixo
  out.bits(0b0111, 4); // tamanho do bloco: 16 bits no fim do cabeçalho
  out.bits(0, 4); // taxa: a do STREAMINFO
  out.bits(0, 4); // mono
  out.bits(0b100, 3); // 16 bits por amostra
  out.bits(0, 1); // reservado
  writeUtf8Number(out, frameNumber);
  out.bits(block.length - 1, 16);
  out.bytes([crc8(out.view(frameStart))]);

  writeSubframe(out, block, residual);

  out.align();
  const crc = crc16(out.view(frameStart));
  out.bytes([crc >> 8, crc & 0xff]);
}

/** Subframe FIXED com a ordem de menor resíduo (ou VERBATIM, se menor). */
function writeSubframe(out: BitWriter, block: Int16Array, residual: Int32Array): void {
  const n = block.length;
  let bestOrder = 0;
  let bestSum = Infinity;
  for (let order = 0; order <= Math.min(MAX_ORDER, n - 1); order++) {
    let sum = 0;
    for (let i = order; i < n; i++) sum += Math.abs(predictResidual(block, i, order));
    if (sum < bestSum) {
      bestSum = sum;
      bestOrder = order;
    }
  }

  const res = residual.subarray(0, n - bestOrder);
  for (let i = bestOrder; i < n; i++) res[i - bestOrder] = predictResidual(block, i, bestOrder);
  const plan = planRice(res, n, bestOrder);

  // Resíduo maior que as amostras cruas (ruído puro): grava sem compressão.
  if (plan.bits + bestOrder * 16 >= n * 16) {
    out.bits(0, 1);
    out.bits(0b000001, 6); // VERBATIM
    out.bits(0, 1);
    for (let i = 0; i < n; i++) out.bits(block[i] & 0xffff, 16);
    return;
  }

  out.bits(0, 1);
  out.bits(0b001000 | bestOrder, 6); // FIXED, ordem
  out.bits(0, 1); // sem "wasted bits"
  for (let i = 0; i < bestOrder; i++) out.bits(block[i] & 0xffff, 16);

  out.bits(0, 2); // Rice com parâmetro de 4 bits
  out.bits(plan.partitionOrder, 4);
  let pos = 0;
  for (const k of plan.params) {
    const size = (n >> plan.partitionOrder) - (pos === 0 ? bestOrder : 0);
    out.bits(k, 4);
    for (let i = pos; i < pos + size; i++) out.rice(res[i], k);
    pos += size;
  }
}

/** Resíduo do preditor fixo de ordem `order` na posição `i`. */
function predictResidual(x: Int16Array, i: number, order: number): number {
  switch (order) {
    case 0:
      return x[i];
    case 1:
      return x[i] - x[i - 1];
    case 2:
      return x[i] - 2 * x[i - 1] + x[i - 2];
    case 3:
      return x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3];
    default:
      return x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
  }
}

/** Escolhe a ordem de partição e o parâmetro Rice de cada partição. */
function planRice(res: Int32Array, n: number, order: number) {
  let best = { partitionOrder: 0, params: [0], bits: Infinity };
  for (let p = 0; p <= MAX_PARTITION_ORDER; p++) {
    const parts = 1 << p;
    if (n % parts !== 0 || n >> p <= order) break;
    const params: number[] = [];
    let bits = 6; // método + ordem de partição
    let pos = 0;
    for (let part = 0; part < parts; part++) {
      const size = (n >> p) - (part === 0 ? order : 0);
      const { k, cost } = bestRiceParam(res, pos, size);
      params.push(k);
      bits += 4 + cost;
      pos += size;
    }
    if (bits < best.bits) best = { partitionOrder: p, params, bits };
  }
  return best;
}

/** Melhor parâmetro Rice para um trecho: estimado pela média, refinado nos vizinhos. */
function bestRiceParam(res: Int32Array, start: number, size: number): { k: number; cost: number } {
  if (size === 0) return { k: 0, cost: 0 };
  let sum = 0;
  for (let i = start; i < start + size; i++) sum += zigzag(res[i]);
  const guess = Math.min(MAX_RICE, Math.max(0, Math.floor(Math.log2(sum / size + 1))));

  let best = { k: guess, cost: Infinity };
  for (let k = Math.max(0, guess - 1); k <= Math.min(MAX_RICE, guess + 1); k++) {
    let cost = size * (k + 1);
    for (let i = start; i < start + size; i++) cost += zigzag(res[i]) >>> k;
    if (cost < best.cost) best = { k, cost };
  }
  return best;
}

/** Inteiro com sinal → sem sinal (0, -1, 1, -2… → 0, 1, 2, 3…). */
function zigzag(v: number): number {
  return v >= 0 ? v * 2 : -v * 2 - 1;
}

/** Número do frame no formato "UTF-8" do FLAC. */
function writeUtf8Number(out: BitWriter, value: number): void {
  if (value < 0x80) return out.bits(value, 8);
  let bytes = 2;
  while (value >= 2 ** (5 * bytes + 1)) bytes++;
  const first = (0xff00 >> bytes) & 0xff; // prefixo com `bytes` uns
  out.bits(first | Math.floor(value / 2 ** (6 * (bytes - 1))), 8);
  for (let i = bytes - 2; i >= 0; i--) out.bits(0x80 | (Math.floor(value / 2 ** (6 * i)) & 0x3f), 8);
}

const CRC8 = makeTable(0x07, 8);
const CRC16 = makeTable(0x8005, 16);

function makeTable(poly: number, width: number): Uint16Array {
  const top = 1 << (width - 1);
  const mask = (1 << width) - 1;
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << (width - 8);
    for (let b = 0; b < 8; b++) c = c & top ? ((c << 1) ^ poly) & mask : (c << 1) & mask;
    table[i] = c;
  }
  return table;
}

function crc8(data: Uint8Array): number {
  let c = 0;
  for (const b of data) c = CRC8[c ^ b];
  return c;
}

function crc16(data: Uint8Array): number {
  let c = 0;
  for (const b of data) c = ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ b];
  return c;
}

/** Escritor de bits big-endian com buffer que cresce sob demanda. */
class BitWriter {
  private buf: Uint8Array;
  private pos = 0; // bytes completos
  private acc = 0; // bits pendentes (sempre < 8 entre chamadas)
  private accBits = 0;

  constructor(initial: number) {
    this.buf = new Uint8Array(Math.max(1024, initial));
  }

  /** Escreve os `n` bits menos significativos de `value` (n ≤ 32). */
  bits(value: number, n: number): void {
    if (n > 24) {
      this.bits(Math.floor(value / 0x10000), n - 16);
      this.bits(value & 0xffff, 16);
      return;
    }
    // acc < 2^7 e n ≤ 24: o deslocamento cabe em 31 bits.
    this.acc = (this.acc << n) | (value & ((1 << n) - 1));
    this.accBits += n;
    while (this.accBits >= 8) {
      this.accBits -= 8;
      this.push((this.acc >>> this.accBits) & 0xff);
    }
    this.acc &= (1 << this.accBits) - 1;
  }

  /** Código Rice de um inteiro com sinal: unário do quociente + `k` bits. */
  rice(value: number, k: number): void {
    const u = zigzag(value);
    let q = Math.floor(u / 2 ** k);
    while (q >= 24) {
      this.bits(0, 24);
      q -= 24;
    }
    this.bits(1, q + 1);
    if (k) this.bits(u % 2 ** k, k);
  }

  bytes(values: ArrayLike<number>): void {
    for (let i = 0; i < values.length; i++) this.bits(values[i], 8);
  }

  /** Completa o byte atual com zeros. */
  align(): void {
    if (this.accBits) this.bits(0, 8 - this.accBits);
  }

  byteLength(): number {
    return this.pos;
  }

  /** Bytes já completos desde `start` (o chamador alinha antes, se precisar). */
  view(start: number): Uint8Array {
    return this.buf.subarray(start, this.pos);
  }

  finish(): Uint8Array {
    this.align();
    return this.buf.slice(0, this.pos);
  }

  private push(byte: number): void {
    if (this.pos === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.pos++] = byte;
  }
}
