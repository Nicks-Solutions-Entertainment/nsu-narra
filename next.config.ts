import type { NextConfig } from 'next';

/**
 * Configuração do Next.js para exportação estática.
 *
 * - `output: 'export'`: gera HTML/JS estático em `out/` (GitHub Pages e Tauri).
 * - `basePath`: no Pages o site fica em `/<nome-do-repo>`; vem do workflow.
 * - O valor é reexposto em `NEXT_PUBLIC_BASE_PATH` para montar URLs de `public/`.
 * - `resolveAlias`:
 *   - `onnxruntime-web/wasm` → carregador que importa o runtime de `public/ort/`
 *     sem passar pelo bundler (o bundler quebra os workers de thread dele);
 *   - built-ins do Node referenciados pelo piper-phonemize (emscripten) viram
 *     um módulo vazio no navegador (esses ramos nunca executam lá).
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const NODE_SHIM = { browser: './src/lib/node-shim.ts' };
const ORT_RUNTIME = './src/engine/wasm/ort-runtime.ts';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      'onnxruntime-web/wasm': ORT_RUNTIME,
      fs: NODE_SHIM,
      path: NODE_SHIM,
      crypto: NODE_SHIM,
    },
  },
};

export default nextConfig;
