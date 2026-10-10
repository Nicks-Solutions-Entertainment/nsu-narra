import { voices as libStaticVoices } from '@mintplex-labs/piper-tts-web';
import { type CatalogEntry, mergeCatalog, OFFICIAL_INDEX_URL, parseOfficialIndex } from '../catalog';
import { readCachedIndex, writeCachedIndex } from './voice-store';

export type { CatalogEntry };

let catalogPromise: Promise<CatalogEntry[]> | null = null;

/**
 * Retorna o catálogo completo (todos os idiomas): oficial + comunidade.
 *
 * Fontes do índice oficial, em ordem:
 *  1. `voices.json` do rhasspy/piper-voices (sempre o mais atual);
 *  2. cópia salva no OPFS na última busca (funciona offline, como PWA);
 *  3. lista embutida na biblioteca WASM (mais antiga, último recurso).
 *
 * Desempenho: memoizado por sessão do worker; uma falha permite nova tentativa.
 */
export function getCatalog(): Promise<CatalogEntry[]> {
  catalogPromise ??= loadCatalog().catch((err) => {
    catalogPromise = null;
    throw err;
  });
  return catalogPromise;
}

/** Busca uma voz pelo id. */
export async function findVoice(id: string): Promise<CatalogEntry> {
  const voice = (await getCatalog()).find((v) => v.id === id);
  if (!voice) throw new Error(`Voz desconhecida: ${id}`);
  return voice;
}

async function loadCatalog(): Promise<CatalogEntry[]> {
  return mergeCatalog(await loadOfficial());
}

async function loadOfficial(): Promise<CatalogEntry[]> {
  try {
    const res = await fetch(OFFICIAL_INDEX_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parsed = parseOfficialIndex(JSON.parse(text));
    void writeCachedIndex(text); // não bloqueia a resposta
    return parsed;
  } catch {
    const cached = await readCachedIndex();
    if (cached) return parseOfficialIndex(JSON.parse(cached));
    return parseOfficialIndex(await libStaticVoices());
  }
}
