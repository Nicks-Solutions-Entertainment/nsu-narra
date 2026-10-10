import { PATH_MAP, voices as fetchAllVoices } from '@mintplex-labs/piper-tts-web';
import type { VoiceInfo } from '../types';
import { TARGET_LANGUAGE } from '../types';

/** Entrada do catálogo sem o estado de instalação (que vem do armazenamento). */
export type CatalogEntry = Omit<VoiceInfo, 'installed'>;

let catalogPromise: Promise<CatalogEntry[]> | null = null;

/**
 * Retorna as vozes do idioma alvo suportadas pela biblioteca WASM.
 *
 * Desempenho: o `voices.json` remoto (~centenas de KB) é buscado uma única vez
 * por sessão do worker e memoizado; a biblioteca cai para uma cópia local
 * embutida se o Hugging Face estiver indisponível.
 *
 * Só retorna vozes presentes em `PATH_MAP`, pois a biblioteca não sabe
 * localizar modelos fora dele.
 */
export function getCatalog(): Promise<CatalogEntry[]> {
  catalogPromise ??= loadCatalog().catch((err) => {
    catalogPromise = null; // permite nova tentativa depois de uma falha
    throw err;
  });
  return catalogPromise;
}

async function loadCatalog(): Promise<CatalogEntry[]> {
  const all = await fetchAllVoices();
  const paths = PATH_MAP as Record<string, string>;

  return all
    .filter((v) => v.language.code.startsWith(TARGET_LANGUAGE) && v.key in paths)
    .map((v) => {
      const modelPath = paths[v.key];
      const files = v.files as Record<string, { size_bytes: number } | undefined>;
      return {
        id: v.key,
        language: v.language.code,
        name: v.name,
        quality: v.quality,
        sizeBytes: files[modelPath]?.size_bytes,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.quality.localeCompare(b.quality));
}

/** URLs remotas do modelo e da configuração de uma voz. */
export function voiceUrls(voiceId: string, hfBase: string): { model: string; config: string } {
  const path = (PATH_MAP as Record<string, string>)[voiceId];
  if (!path) throw new Error(`Voz desconhecida: ${voiceId}`);
  return { model: `${hfBase}/${path}`, config: `${hfBase}/${path}.json` };
}
