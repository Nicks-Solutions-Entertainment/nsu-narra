import { AbortError } from '../types';
import type { CatalogEntry, VoiceFile } from '../catalog';

/**
 * Armazenamento de modelos no OPFS (Origin Private File System).
 *
 * Cada voz declara seus arquivos no catálogo (`CatalogEntry.files`):
 *  - Piper: `<id>.onnx` + `<id>.onnx.json` — o mesmo diretório e nomes que a
 *    biblioteca `@mintplex-labs/piper-tts-web` lê, então `TtsSession` encontra
 *    o modelo sem buscá-lo de novo;
 *  - Kokoro: modelo compartilhado + `<id>.bin` (vetor de estilo).
 *
 * Os nomes vêm do catálogo (não da URL) porque vozes da comunidade usam nomes
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

/** Nomes dos arquivos salvos. Custo: uma varredura do diretório, O(arquivos). */
export async function listFiles(): Promise<Set<string>> {
  const dir = await storeDir();
  const names = new Set<string>();
  // `keys()` existe em runtime mas ainda falta em algumas versões do lib.dom.
  for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
    names.add(name);
  }
  return names;
}

/** A voz está instalada quando todos os seus arquivos existem. */
export function isInstalled(voice: CatalogEntry, files: Set<string>): boolean {
  return voice.files.every((f) => files.has(f.name));
}

/** Bytes que ainda faltam para instalar a voz (arquivos compartilhados já presentes não contam). */
export function missingBytes(voice: CatalogEntry, files: Set<string>): number {
  return voice.files.reduce((n, f) => n + (files.has(f.name) ? 0 : (f.bytes ?? 0)), 0);
}

/**
 * Baixa os arquivos que faltam de uma voz direto para o OPFS, em streaming.
 *
 * Desempenho: o corpo da resposta é encadeado (`pipeTo`) para o arquivo, então
 * a memória usada fica constante independentemente do tamanho do modelo.
 * `createWritable()` só efetiva o arquivo no `close()`, então um download
 * interrompido não deixa um modelo corrompido.
 *
 * Os arquivos são baixados na ordem do catálogo; o último marca a voz como
 * instalada. O progresso soma todos os arquivos que faltam.
 *
 * @param onProgress Chamado com (bytesRecebidos, bytesTotais).
 */
export async function downloadVoice(
  voice: CatalogEntry,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const dir = await storeDir();
  const present = await listFiles();
  const pending = voice.files.filter((f) => !present.has(f.name));
  const total = pending.reduce((n, f) => n + (f.bytes ?? 0), 0);

  let done = 0;
  for (const file of pending) {
    await streamToFile(dir, file, (loaded) => onProgress(done + loaded, total), signal);
    done += file.bytes ?? 0;
  }
}

async function streamToFile(
  dir: FileSystemDirectoryHandle,
  file: VoiceFile,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(file.url, { signal });
  if (!res.ok || !res.body) throw new Error(`Falha ao baixar ${file.name} (HTTP ${res.status}).`);

  let loaded = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      loaded += chunk.byteLength;
      onProgress(loaded);
      controller.enqueue(chunk);
    },
  });

  const handle = await dir.getFileHandle(file.name, { create: true });
  const writable = await handle.createWritable();
  try {
    await res.body.pipeThrough(counter).pipeTo(writable, { signal });
  } catch (err) {
    if (signal.aborted) {
      await dir.removeEntry(file.name).catch(() => {});
      throw new AbortError('Download cancelado.');
    }
    throw err;
  }
}

/**
 * Remove os arquivos de uma voz. Arquivos compartilhados só saem quando
 * nenhuma outra voz instalada (`keep`) os usa. Ignora arquivos inexistentes.
 */
export async function removeVoice(voice: CatalogEntry, keep: Set<string>): Promise<void> {
  const dir = await storeDir();
  await Promise.all(
    voice.files.filter((f) => !keep.has(f.name)).map((f) => dir.removeEntry(f.name).catch(() => {})),
  );
}

/** Lê um arquivo salvo (ou `null` se não existir). */
export async function readFile(name: string): Promise<File | null> {
  try {
    return await (await (await storeDir()).getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

/**
 * Lê a configuração (`.onnx.json`) de uma voz Piper instalada.
 * Retorna `null` se a voz não estiver no OPFS.
 */
export async function readVoiceConfig<T = unknown>(voiceId: string): Promise<T | null> {
  const file = await readFile(configFile(voiceId));
  return file ? (JSON.parse(await file.text()) as T) : null;
}

/** Cópia local do índice oficial, para listar vozes offline. */
export async function readCachedIndex(): Promise<string | null> {
  return (await readFile(INDEX_CACHE))?.text() ?? null;
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
