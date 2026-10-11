/**
 * Substituto de `onnxruntime-web/wasm` (ligado via `turbopack.resolveAlias`
 * em next.config.ts).
 *
 * Carrega o build ESM oficial servido em `public/ort/` em tempo de execução,
 * fora do bundler. Assim as funções que o onnxruntime serializa para criar os
 * workers de thread chegam intactas (ver scripts/copy-ort.mjs).
 *
 * O módulo é exportado com o filtro de fonemas para modelos antigos
 * (ver phoneme-guard.ts) e com o ritmo de fala ajustado (ver speech-pace.ts).
 *
 * A biblioteca piper-tts-web faz `await import('onnxruntime-web/wasm')` e usa
 * `module.default || module`, por isso exportamos como `default`.
 */
import { ORT_BASE_URL } from './ort-paths';
import { withPhonemeGuard } from './phoneme-guard';
import { withSpeechPace } from './speech-pace';

const ort = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${ORT_BASE_URL}ort.wasm.min.js`);

export default withSpeechPace(withPhonemeGuard(ort));
