/**
 * Flags de funcionalidade, resolvidas no build (o valor é embutido no código,
 * então o que estiver desligado sai do bundle).
 *
 * Para desligar uma flag, defina a variável de ambiente correspondente como
 * `off` no build (ex.: `.env.local` ou no workflow do GitHub Pages).
 */
export const FEATURES = {
  /**
   * Vozes Kokoro-82M (Apache 2.0) rodando no navegador.
   *
   * Temporária: quando as vozes Kokoro forem destiladas para Piper (projeto
   * narra-voice-lab), desligue com `NEXT_PUBLIC_FEATURE_KOKORO=off` e remova
   * o código em `src/engine/wasm/kokoro.ts` e `src/engine/catalog/kokoro-*`.
   */
  kokoro: process.env.NEXT_PUBLIC_FEATURE_KOKORO !== 'off',
} as const;
