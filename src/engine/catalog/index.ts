import type { VoiceInfo } from '../types';
import community from './community-voices.json';

/**
 * Catálogo de vozes (independente de motor): oficial (rhasspy) + comunidade.
 * O desktop tem a mesma lógica em `src-tauri/src/services/catalog.rs`.
 */

/** Base de download do repositório oficial de vozes. */
export const OFFICIAL_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
export const OFFICIAL_INDEX_URL = `${OFFICIAL_BASE}/voices.json`;

/** Entrada do catálogo: metadados + onde baixar. `installed` vem do armazenamento. */
export type CatalogEntry = Omit<VoiceInfo, 'installed'> & {
  modelUrl: string;
  configUrl: string;
};

/** Formato do `voices.json` do Piper (só os campos usados). */
interface RawVoice {
  key: string;
  name: string;
  quality: string;
  language: { code: string };
  files: Record<string, { size_bytes: number } | undefined>;
}

/**
 * Converte o `voices.json` oficial em entradas do catálogo.
 * Aceita objeto (`{id: voz}`) ou array, que é como a lib WASM o devolve.
 */
export function parseOfficialIndex(raw: Record<string, RawVoice> | RawVoice[]): CatalogEntry[] {
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  const out: CatalogEntry[] = [];

  for (const v of list) {
    const modelPath = Object.keys(v.files).find((p) => p.endsWith('.onnx'));
    if (!modelPath) continue;
    out.push({
      id: v.key,
      language: v.language.code,
      name: v.name,
      quality: v.quality,
      sizeBytes: v.files[modelPath]?.size_bytes,
      source: 'official',
      homepage: `https://huggingface.co/rhasspy/piper-voices/tree/main/${dirname(modelPath)}`,
      modelUrl: `${OFFICIAL_BASE}/${modelPath}`,
      configUrl: `${OFFICIAL_BASE}/${modelPath}.json`,
    });
  }
  return out;
}

/** Vozes da comunidade embutidas no build. */
export const COMMUNITY_VOICES: readonly CatalogEntry[] = community.voices.map((v) => ({
  ...v,
  gender: v.gender as CatalogEntry['gender'],
  source: 'community' as const,
}));

/**
 * Junta oficial + comunidade (a oficial vence em caso de id repetido) e
 * ordena por idioma, nome e qualidade.
 */
export function mergeCatalog(official: CatalogEntry[]): CatalogEntry[] {
  const byId = new Map<string, CatalogEntry>();
  for (const v of COMMUNITY_VOICES) byId.set(v.id, v);
  for (const v of official) byId.set(v.id, v);

  return [...byId.values()].sort(
    (a, b) =>
      a.language.localeCompare(b.language) ||
      a.name.localeCompare(b.name) ||
      QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality),
  );
}

const QUALITY_ORDER = ['x_low', 'low', 'medium', 'high'];

function dirname(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}
