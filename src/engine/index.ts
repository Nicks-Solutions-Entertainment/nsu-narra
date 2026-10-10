import { FEATURES } from '@/config/features';
import type { TtsEngine } from './types';

export type * from './types';
export { AbortError } from './types';

/**
 * Cria o motor adequado ao ambiente em tempo de execução.
 *
 * - Dentro do Tauri 2 (`isTauri()`): `TauriEngine` (Rust + Piper nativo). Com
 *   `FEATURES.kokoro`, as vozes Kokoro rodam num `WasmEngine` na própria janela.
 * - Caso contrário: `WasmEngine` (Piper e Kokoro em WASM num Web Worker).
 *
 * Desempenho: cada motor é carregado por `import()` dinâmico, então o bundle
 * inicial não inclui o código do motor que não será usado.
 */
export async function createEngine(): Promise<TtsEngine> {
  if (typeof window === 'undefined') {
    throw new Error('createEngine() só pode ser chamado no navegador.');
  }

  const { isTauri } = await import('@tauri-apps/api/core');
  if (isTauri()) {
    const { TauriEngine } = await import('./tauri-engine');
    if (!FEATURES.kokoro) return new TauriEngine();
    const { WasmEngine } = await import('./wasm/wasm-engine');
    return new TauriEngine(new WasmEngine());
  }

  const { WasmEngine } = await import('./wasm/wasm-engine');
  return new WasmEngine();
}
