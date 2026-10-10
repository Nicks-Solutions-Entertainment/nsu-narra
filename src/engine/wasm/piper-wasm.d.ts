/** Tipos mínimos do módulo emscripten do piper-phonemize (sem tipos publicados). */
declare module '@diffusionstudio/piper-wasm/build/piper_phonemize.js' {
  interface PiperPhonemizeOptions {
    print?: (data: string) => void;
    printErr?: (message: string) => void;
    locateFile?: (url: string) => string;
  }
  const createPiperPhonemize: (options?: PiperPhonemizeOptions) => Promise<{ callMain(args: string[]): void }>;
  export default createPiperPhonemize;
}
