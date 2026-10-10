import { HF_BASE } from '@mintplex-labs/piper-tts-web';
import { AbortError } from '../types';
import { voiceUrls } from './voice-catalog';

/**
 * Armazenamento de modelos no OPFS (Origin Private File System).
 *
 * Usa o mesmo diretório (`piper/`) e nomes de arquivo da biblioteca
 * `@mintplex-labs/piper-tts-web`, para que `TtsSession` encontre os modelos
 * já baixados sem buscá-los de novo.
 *
 * Substitui `download()` da biblioteca porque aquela versão:
 *  - acumula o arquivo inteiro na memória antes de gravar (~60 MB por voz);
 *  - não aguarda a gravação terminar (a voz pode aparecer como não instalada).
 */

const STORE_DIR = 'piper';

/** Nome do arquivo no OPFS, igual ao usado pela biblioteca (último segmento da URL). */
const fileName = (url: string) => url.slice(url.lastIndexOf('/') + 1);

async function storeDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(STORE_DIR, { create: true });
}

/**
 * Lista os ids das vozes completamente instaladas (modelo + config).
 * Custo: uma varredura do diretório, O(arquivos).
 */
export async function listInstalled(): Promise<Set<string>> {
  const dir = await storeDir();
  const names = new Set<string>();
  // `keys()` existe em runtime mas ainda falta em algumas versões do lib.dom.
  for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
    names.add(name);
  }

  const installed = new Set<string>();
  for (const name of names) {
    if (!name.endsWith('.onnx')) continue;
    if (names.has(`${name}.json`)) installed.add(name.slice(0, -'.onnx'.length));
  }
  return installed;
}

/**
 * Baixa modelo e configuração de uma voz direto para o OPFS, em streaming.
 *
 * Desempenho: o corpo da resposta é encadeado (`pipeTo`) para o arquivo, então
 * a memória usada fica constante independentemente do tamanho do modelo.
 * `createWritable()` só efetiva o arquivo no `close()`, então um download
 * interrompido não deixa um modelo corrompido.
 *
 * @param onProgress Chamado com (bytesRecebidos, bytesTotais).
 */
export async function downloadVoice(
  voiceId: string,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const { model, config } = voiceUrls(voiceId, HF_BASE);
  const dir = await storeDir();

  await streamToFile(dir, model, onProgress, signal);
  // A config é pequena e gravada por último: a voz só conta como instalada
  // quando os dois arquivos existem.
  await streamToFile(dir, config, () => {}, signal);
}

async function streamToFile(
  dir: FileSystemDirectoryHandle,
  url: string,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`Falha ao baixar ${fileName(url)} (HTTP ${res.status}).`);

  const total = Number(res.headers.get('Content-Length') ?? 0);
  let loaded = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      loaded += chunk.byteLength;
      onProgress(loaded, total);
      controller.enqueue(chunk);
    },
  });

  const handle = await dir.getFileHandle(fileName(url), { create: true });
  const writable = await handle.createWritable();
  try {
    await res.body.pipeThrough(counter).pipeTo(writable, { signal });
  } catch (err) {
    if (signal.aborted) {
      await dir.removeEntry(fileName(url)).catch(() => {});
      throw new AbortError('Download cancelado.');
    }
    throw err;
  }
}

/** Remove os arquivos de uma voz. Ignora arquivos que já não existem. */
export async function removeVoice(voiceId: string): Promise<void> {
  const { model, config } = voiceUrls(voiceId, HF_BASE);
  const dir = await storeDir();
  await Promise.all(
    [model, config].map((url) => dir.removeEntry(fileName(url)).catch(() => {})),
  );
}
