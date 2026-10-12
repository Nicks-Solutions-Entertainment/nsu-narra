import type { VoiceInfo } from '../types';
import community from './community-voices.json';
import kokoro from './kokoro-voices.json';
import officialLicenses from './official-licenses.json';
import supertonic from './supertonic-voices.json';

/**
 * Catálogo de vozes (independente de motor): oficial (rhasspy) + comunidade,
 * e as vozes Kokoro e Supertonic quando as flags estiverem ligadas.
 * O desktop tem a parte Piper em `src-tauri/src/services/catalog.rs`.
 */

/** Base de download do repositório oficial de vozes. */
export const OFFICIAL_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
export const OFFICIAL_INDEX_URL = `${OFFICIAL_BASE}/voices.json`;
/** Amostras publicadas pelo projeto Piper (MP3 ~100 KB, com CORS). */
const OFFICIAL_SAMPLES = 'https://rhasspy.github.io/piper-samples/samples';

const LICENSES = officialLicenses as Record<string, Pick<VoiceInfo, 'license' | 'commercial' | 'licenseNote'>>;

/** Voz oficial nova, ainda fora de official-licenses.json. */
const UNVERIFIED = { license: 'Não verificada', commercial: 'unclear', licenseNote: 'Licença ainda não verificada; confira o cartão da voz.' } as const;

/**
 * Arquivo necessário para uma voz. A voz está instalada quando todos existem.
 * `shared`: usado por várias vozes (só é apagado quando nenhuma o usa mais).
 */
export interface VoiceFile {
  name: string;
  url: string;
  bytes?: number;
  shared?: boolean;
}

/** Entrada do catálogo: metadados + arquivos. `installed` vem do armazenamento. */
export type CatalogEntry = Omit<VoiceInfo, 'installed' | 'downloadBytes'> & {
  files: VoiceFile[];
  /** Voz do espeak-ng para os fonemas (vozes Kokoro). */
  espeakVoice?: string;
  /** Código de idioma do modelo (vozes Supertonic, ex.: `pt`). */
  modelLang?: string;
};

/** Formato do `voices.json` do Piper (só os campos usados). */
interface RawVoice {
  key: string;
  name: string;
  quality: string;
  language: { code: string };
  files: Record<string, { size_bytes: number } | undefined>;
}

/** Arquivos de uma voz Piper: modelo e configuração (esta por último). */
function piperFiles(id: string, modelUrl: string, configUrl: string, bytes?: number): VoiceFile[] {
  return [
    { name: `${id}.onnx`, url: modelUrl, bytes },
    { name: `${id}.onnx.json`, url: configUrl },
  ];
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
    const sizeBytes = v.files[modelPath]?.size_bytes;
    out.push({
      id: v.key,
      language: v.language.code,
      name: v.name,
      quality: v.quality,
      sizeBytes,
      family: 'piper',
      source: 'official',
      ...(LICENSES[v.key] ?? UNVERIFIED),
      homepage: `https://huggingface.co/rhasspy/piper-voices/tree/main/${dirname(modelPath)}`,
      sampleUrl: `${OFFICIAL_SAMPLES}/${dirname(modelPath)}/speaker_0.mp3`,
      files: piperFiles(v.key, `${OFFICIAL_BASE}/${modelPath}`, `${OFFICIAL_BASE}/${modelPath}.json`, sizeBytes),
    });
  }
  return out;
}

/** Vozes Piper da comunidade embutidas no build. */
export const COMMUNITY_VOICES: readonly CatalogEntry[] = community.voices.map(({ modelUrl, configUrl, ...v }) => ({
  ...v,
  gender: v.gender as CatalogEntry['gender'],
  commercial: v.commercial as CatalogEntry['commercial'],
  family: 'piper' as const,
  source: 'community' as const,
  files: piperFiles(v.id, modelUrl, configUrl, v.sizeBytes),
}));

/** Nome do modelo Kokoro compartilhado no armazenamento local. */
export const KOKORO_MODEL = kokoro.model;

/**
 * Vozes Kokoro: o modelo (~88 MB) é um arquivo compartilhado; cada voz só
 * acrescenta seu vetor de estilo (~0,5 MB).
 */
export const KOKORO_VOICES: readonly CatalogEntry[] = kokoro.voices.map((v) => ({
  id: v.id,
  language: v.language,
  name: v.name,
  quality: 'medium',
  gender: v.gender as CatalogEntry['gender'],
  sizeBytes: v.bytes,
  sharedBytes: kokoro.model.bytes,
  family: 'kokoro' as const,
  source: 'official' as const,
  license: kokoro.license,
  commercial: kokoro.commercial as CatalogEntry['commercial'],
  attribution: kokoro.attribution,
  homepage: kokoro.homepage,
  espeakVoice: v.espeakVoice,
  files: [
    { name: kokoro.model.file, url: kokoro.model.url, bytes: kokoro.model.bytes, shared: true },
    { name: `${v.id}.bin`, url: v.url, bytes: v.bytes },
  ],
}));

/** Arquivos compartilhados do Supertonic 3, na ordem em que são carregados. */
export const SUPERTONIC_FILES = Object.fromEntries(
  supertonic.shared.map((f) => [f.path.slice(f.path.lastIndexOf('/') + 1).replace(/\.\w+$/, ''), f.file]),
) as Record<'tts' | 'unicode_indexer' | 'duration_predictor' | 'text_encoder' | 'vocoder' | 'vector_estimator', string>;

const SUPERTONIC_SHARED: VoiceFile[] = supertonic.shared.map((f) => ({
  name: f.file,
  url: `${supertonic.baseUrl}/${f.path}`,
  bytes: f.bytes,
  shared: true,
}));

/**
 * Vozes Supertonic 3: os quatro modelos (~380 MB) são compartilhados; cada
 * voz só acrescenta seu estilo (~0,3 MB). O estilo vem por último na lista de
 * arquivos, então a voz só aparece instalada depois do download completo.
 */
export const SUPERTONIC_VOICES: readonly CatalogEntry[] = supertonic.voices.map((v) => ({
  id: v.id,
  language: v.language,
  name: v.name,
  quality: 'high',
  gender: v.gender as CatalogEntry['gender'],
  sizeBytes: v.bytes,
  sharedBytes: SUPERTONIC_SHARED.reduce((n, f) => n + (f.bytes ?? 0), 0),
  family: 'supertonic' as const,
  source: 'official' as const,
  license: supertonic.license,
  commercial: supertonic.commercial as CatalogEntry['commercial'],
  licenseNote: supertonic.licenseNote,
  attribution: supertonic.attribution,
  homepage: supertonic.homepage,
  modelLang: supertonic.lang,
  files: [
    ...SUPERTONIC_SHARED,
    { name: `${v.id}.json`, url: `${supertonic.baseUrl}/voice_styles/${v.style}.json`, bytes: v.bytes },
  ],
}));

/**
 * Junta oficial + comunidade (a oficial vence em caso de id repetido) +
 * extras (ex.: Kokoro, Supertonic) e ordena por idioma, nome e qualidade.
 */
export function mergeCatalog(official: CatalogEntry[], extra: readonly CatalogEntry[] = []): CatalogEntry[] {
  const byId = new Map<string, CatalogEntry>();
  for (const v of COMMUNITY_VOICES) byId.set(v.id, v);
  for (const v of official) byId.set(v.id, v);
  for (const v of extra) byId.set(v.id, v);

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
