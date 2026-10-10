/**
 * Módulo vazio usado no lugar de built-ins do Node (`fs`, `path`, ...) no
 * bundle do navegador. As bibliotecas emscripten (piper-phonemize e
 * onnxruntime-web) só chamam esses módulos quando detectam Node.js.
 */
const shim = {};
export default shim;
