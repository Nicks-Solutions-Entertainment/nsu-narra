import { voices as libStaticVoices } from '@mintplex-labs/piper-tts-web';
import { FEATURES } from '@/config/features';
import type { VoiceFamily } from '../types';
import { type CatalogEntry, KOKORO_VOICES, mergeCatalog, OFFICIAL_INDEX_URL, parseOfficialIndex } from '../catalog';
import { readCachedIndex, writeCachedIndex } from './voice-store';

export type { CatalogEntry };

let piperPromise: Promise<CatalogEntry[]> | null = null;

/** Vozes extras disponíveis neste build (dependem das flags). */
const EXTRA_VOICES: readonly CatalogEntry[] = FEATURES.kokoro ? KOKORO_VOICES : [];

/**
 * Retorna o catálogo das famílias pedidas (padrão: todas).
 *
 * Fontes do índice oficial Piper, em ordem:
 *  1. `voices.json` do rhasspy/piper-voices (sempre o mais atual);
 *  2. cópia salva no OPFS na última busca (funciona offline, como PWA);
 *  3. lista embutida na biblioteca WASM (mais antiga, último recurso).
 *
 * Desempenho: memoizado por sessão do worker; uma falha permite nova tentativa.
 * Pedir só `kokoro` (caso do desktop) não busca o índice Piper.
 */
export async function getCatalog(families?: readonly VoiceFamily[]): Promise<CatalogEntry[]> {
  const wantPiper = !families || families.includes('piper');
  const extra = EXTRA_VOICES.filter((v) => !families || families.includes(v.family));
  if (!wantPiper) return mergeCatalog([], extra).filter((v) => v.family !== 'piper');

  piperPromise ??= loadOfficial().catch((err) => {
    piperPromise = null;
    throw err;
  });
  return mergeCatalog(await piperPromise, extra);
}

/** Busca uma voz pelo id. */
export async function findVoice(id: string): Promise<CatalogEntry> {
  const local = EXTRA_VOICES.find((v) => v.id === id);
  if (local) return local;
  const voice = (await getCatalog()).find((v) => v.id === id);
  if (!voice) throw new Error(`Voz desconhecida: ${id}`);
  return voice;
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
