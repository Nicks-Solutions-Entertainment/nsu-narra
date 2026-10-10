/**
 * Copia o runtime do onnxruntime-web para `public/ort/`, servido sem bundler.
 *
 * Por que: com threads, o onnxruntime cria workers `blob:` a partir do
 * `toString()` das próprias funções. Se o código passa pelo Turbopack, essas
 * funções passam a referenciar módulos internos do bundle (ex.: o polyfill de
 * `process`), que não existem dentro do blob → ReferenceError.
 *
 * Só copia o que mudou (compara tamanho), então rodar a cada dev/build é barato.
 * Executado por `dev` e `build` (ver package.json).
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const dest = join(root, 'public', 'ort');

/** [origem relativa a dist/, nome publicado]. Só builds SIMD: todos os navegadores atuais suportam. */
const FILES = [
  ['esm/ort.wasm.min.js', 'ort.wasm.min.js'],
  ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
  ['ort-wasm-simd.wasm', 'ort-wasm-simd.wasm'],
];

if (!existsSync(src)) {
  console.error('[copy-ort] onnxruntime-web não encontrado. Rode a instalação de dependências.');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
let copied = 0;
for (const [from, to] of FILES) {
  const a = join(src, from);
  const b = join(dest, to);
  if (existsSync(b) && statSync(b).size === statSync(a).size) continue;
  copyFileSync(a, b);
  copied++;
}
console.log(`[copy-ort] public/ort pronto (${copied} arquivo(s) atualizado(s)).`);
