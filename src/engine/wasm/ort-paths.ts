/**
 * URL absoluta de `public/ort/` (respeita o basePath do GitHub Pages).
 * Usada para importar o runtime e como `wasmPaths` dos arquivos `.wasm`.
 * Só pode ser avaliada no navegador/worker (usa `self.location`).
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const ORT_BASE_URL = new URL(`${basePath}/ort/`, self.location.origin).href;
