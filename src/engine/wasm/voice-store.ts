import { AbortError } from '../types';
import type { CatalogEntry } from '../catalog';

/**
 * Armazenamento de modelos no OPFS (Origin Private File System).
 *
 * Arquivos de uma voz: `piper/<id>.onnx` e `piper/<id>.onnx.json` — o mesmo
 * diretório e nomes que a biblioteca `@mintplex-labs/piper-tts-web` lê, então
 * `TtsSession` encontra o modelo sem buscá-lo de novo.
 *
 * Os nomes vêm do id (não da URL) porque vozes da comunidade usam nomes
 * arbitrários no repositório (ex.: `config.json`).
 *
 * Substitui `download()` da biblioteca porque aquela versão acumula o arquivo
 * inteiro na memória (~60 MB) e não aguarda a gravação terminar.
 */

const STORE_DIR = 'piper';
const INDEX_CACHE = 'voices-index.json';

export const modelFile = (id: string) => `${id}.onnx`;
export const configFile = (id: string) => `${id}.onnx.json`;

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
    const id = name.slice(0, -'.onnx'.length);
    if (names.has(configFile(id))) installed.add(id);
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
  voice: CatalogEntry,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const dir = await storeDir();
  await streamToFile(dir, voice.modelUrl, modelFile(voice.id), onProgress, signal, voice.sizeBytes);
  // A config é pequena e gravada por último: a voz só conta como instalada
  // quando os dois arquivos existem.
  await streamToFile(dir, voice.configUrl, configFile(voice.id), () => {}, signal);
}

async function streamToFile(
  dir: FileSystemDirectoryHandle,
  url: string,
  name: string,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
  expectedSize = 0,
): Promise<void> {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`Falha ao baixar ${name} (HTTP ${res.status}).`);

  const total = Number(res.headers.get('Content-Length') ?? 0) || expectedSize;
  let loaded = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      loaded += chunk.byteLength;
      onProgress(loaded, total);
      controller.enqueue(chunk);
    },
  });

  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await res.body.pipeThrough(counter).pipeTo(writable, { signal });
  } catch (err) {
    if (signal.aborted) {
      await dir.removeEntry(name).catch(() => {});
      throw new AbortError('Download cancelado.');
    }
    throw err;
  }
}

/**
 * Lê a configuração (`.onnx.json`) de uma voz instalada.
 * Retorna `null` se a voz não estiver no OPFS.
 */
export async function readVoiceConfig<T = unknown>(voiceId: string): Promise<T | null> {
  const text = await readText(configFile(voiceId));
  return text === null ? null : (JSON.parse(text) as T);
}

/** Remove os arquivos de uma voz. Ignora arquivos que já não existem. */
export async function removeVoice(voiceId: string): Promise<void> {
  const dir = await storeDir();
  await Promise.all([modelFile(voiceId), configFile(voiceId)].map((n) => dir.removeEntry(n).catch(() => {})));
}

/** Cópia local do índice oficial, para listar vozes offline. */
export function readCachedIndex(): Promise<string | null> {
  return readText(INDEX_CACHE);
}

export async function writeCachedIndex(text: string): Promise<void> {
  try {
    const writable = await (await (await storeDir()).getFileHandle(INDEX_CACHE, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
  } catch {
    /* cache é opcional */
  }
}

async function readText(name: string): Promise<string | null> {
  try {
    const file = await (await (await storeDir()).getFileHandle(name)).getFile();
    return await file.text();
  } catch {
    return null;
  }
}
