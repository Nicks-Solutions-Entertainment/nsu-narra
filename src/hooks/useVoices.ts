'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TtsEngine, VoiceInfo } from '@/engine';
import { DEFAULT_LANGUAGE, languageLabel } from '@/lib/languages';
import { PREF_KEYS, readPref, writePref } from '@/lib/storage';
import { errorMessage } from './useEngine';

/** Percentual de download por id de voz (apenas downloads em andamento). */
export type DownloadMap = Readonly<Record<string, number>>;

/** Idioma disponível no seletor, com contagem de vozes. */
export interface LanguageOption {
  code: string;
  label: string;
  total: number;
  installed: number;
}

export interface VoicesState {
  loading: boolean;
  error: string | null;
  languages: LanguageOption[];
  language: string;
  /** Vozes do idioma selecionado. */
  voices: VoiceInfo[];
  /** Vozes instaladas no aparelho (todos os idiomas). */
  installed: VoiceInfo[];
  /** Soma dos tamanhos das vozes instaladas, em bytes. */
  installedBytes: number;
  selected: VoiceInfo | null;
  downloads: DownloadMap;
  selectLanguage: (code: string) => void;
  selectVoice: (id: string) => void;
  download: (id: string) => Promise<void>;
  cancelDownload: (id: string) => void;
  /** Remove uma ou mais vozes do aparelho. */
  remove: (ids: string | string[]) => Promise<void>;
  reload: () => void;
}

/**
 * Estado do catálogo: idioma, voz, download e remoção.
 *
 * Desempenho:
 *  - O catálogo (~180 vozes) é carregado uma vez; baixar/remover atualiza o
 *    estado local em vez de listar tudo de novo.
 *  - Idiomas e vozes do idioma são derivados com `useMemo`.
 *  - Callbacks estáveis (`useCallback`) para os componentes memoizados.
 */
export function useVoices(engine: TtsEngine | null): VoicesState {
  const [all, setAll] = useState<VoiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<DownloadMap>({});
  const [reloadKey, setReloadKey] = useState(0);
  const controllers = useRef(new Map<string, AbortController>());

  // Carrega o catálogo quando o motor fica pronto (ou ao pedir recarga).
  useEffect(() => {
    if (!engine) return;
    let active = true;

    engine
      .listVoices()
      .then((list) => {
        if (!active) return;
        setAll(list);
        const initial = pickInitialVoice(list);
        if (initial) {
          setLanguage(initial.language);
          setSelectedId((current) => current ?? initial.id);
        }
      })
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [engine, reloadKey]);

  // Cancela downloads pendentes ao desmontar.
  useEffect(() => {
    const map = controllers.current;
    return () => map.forEach((c) => c.abort());
  }, []);

  const languages = useMemo(() => buildLanguages(all), [all]);
  const voices = useMemo(() => all.filter((v) => v.language === language), [all, language]);
  const selected = useMemo(() => voices.find((v) => v.id === selectedId) ?? null, [voices, selectedId]);
  const installed = useMemo(() => all.filter((v) => v.installed), [all]);
  const installedBytes = useMemo(() => sumInstalledBytes(installed), [installed]);

  const selectVoice = useCallback((id: string) => {
    setSelectedId(id);
    writePref(PREF_KEYS.voice, id);
  }, []);

  const selectLanguage = useCallback(
    (code: string) => {
      setLanguage(code);
      writePref(PREF_KEYS.language, code);
      const best = bestVoice(all.filter((v) => v.language === code));
      if (best) selectVoice(best.id);
    },
    [all, selectVoice],
  );

  const patchVoice = useCallback((id: string, patch: Partial<VoiceInfo>) => {
    setAll((list) => list.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }, []);

  /**
   * Relê o estado do armazenamento sem mostrar "carregando". Necessário quando
   * arquivos compartilhados mudam (ex.: o modelo Kokoro), pois isso altera o
   * tamanho a baixar de outras vozes. Barato: o catálogo já está em memória.
   */
  const sync = useCallback(async () => {
    if (!engine) return;
    try {
      const list = await engine.listVoices();
      setAll(list);
    } catch {
      /* mantém o estado local; o próximo carregamento corrige */
    }
  }, [engine]);

  const setProgress = useCallback((id: string, pct: number | null) => {
    setDownloads((map) => {
      if (pct === null) {
        if (!(id in map)) return map;
        const next = { ...map };
        delete next[id];
        return next;
      }
      return map[id] === pct ? map : { ...map, [id]: pct };
    });
  }, []);

  const download = useCallback(
    async (id: string) => {
      if (!engine || controllers.current.has(id)) return;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      setProgress(id, 0);
      setError(null);

      try {
        await engine.downloadVoice(id, {
          signal: controller.signal,
          onProgress: (pct) => setProgress(id, pct),
        });
        patchVoice(id, { installed: true, downloadBytes: 0 });
        if (all.find((v) => v.id === id)?.sharedBytes) void sync();
      } catch (err) {
        if (!controller.signal.aborted) setError(errorMessage(err));
      } finally {
        controllers.current.delete(id);
        setProgress(id, null);
      }
    },
    [engine, patchVoice, setProgress, all, sync],
  );

  const cancelDownload = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  /**
   * Remove vozes do aparelho (em sequência, para não disputar o armazenamento).
   * Se a voz selecionada sair, a seleção passa para a melhor voz instalada que
   * restou no mesmo idioma — evita ficar com uma voz que exige novo download.
   */
  const remove = useCallback(
    async (ids: string | string[]) => {
      if (!engine) return;
      const list = Array.isArray(ids) ? ids : [ids];
      const removed = new Set<string>();
      try {
        for (const id of list) {
          await engine.removeVoice(id);
          removed.add(id);
          patchVoice(id, { installed: false });
        }
      } catch (err) {
        setError(errorMessage(err));
      }
      if (all.some((v) => removed.has(v.id) && v.sharedBytes)) void sync();

      if (selectedId && removed.has(selectedId)) {
        const remaining = all
          .filter((v) => v.language === language)
          .map((v) => (removed.has(v.id) ? { ...v, installed: false } : v));
        const next = remaining.find((v) => v.installed && v.id !== selectedId);
        if (next) selectVoice(next.id);
      }
    },
    [engine, patchVoice, selectedId, all, language, selectVoice, sync],
  );

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  return {
    loading,
    error,
    languages,
    language,
    voices,
    installed,
    installedBytes,
    selected,
    downloads,
    selectLanguage,
    selectVoice,
    download,
    cancelDownload,
    remove,
    reload,
  };
}

/**
 * Espaço ocupado: tamanho de cada voz + arquivos compartilhados uma vez por
 * família (o modelo Kokoro serve a todas as vozes Kokoro).
 */
function sumInstalledBytes(installed: VoiceInfo[]): number {
  const shared = new Map<string, number>();
  let total = 0;
  for (const v of installed) {
    total += v.sizeBytes ?? 0;
    if (v.sharedBytes) shared.set(v.family, v.sharedBytes);
  }
  return total + [...shared.values()].reduce((n, b) => n + b, 0);
}

/** Agrupa as vozes por idioma; o idioma padrão vem primeiro, depois por nome. */
function buildLanguages(list: VoiceInfo[]): LanguageOption[] {
  const map = new Map<string, LanguageOption>();
  for (const v of list) {
    const opt = map.get(v.language) ?? { code: v.language, label: languageLabel(v.language), total: 0, installed: 0 };
    opt.total++;
    if (v.installed) opt.installed++;
    map.set(v.language, opt);
  }
  return [...map.values()].sort(
    (a, b) =>
      Number(b.code === DEFAULT_LANGUAGE) - Number(a.code === DEFAULT_LANGUAGE) || a.label.localeCompare(b.label, 'pt-BR'),
  );
}

/** Melhor voz de uma lista: instalada > `medium` > primeira. */
function bestVoice(list: VoiceInfo[]): VoiceInfo | undefined {
  return list.find((v) => v.installed) ?? list.find((v) => v.quality === 'medium') ?? list[0];
}

/**
 * Voz inicial: a última usada (se ainda existir); senão a melhor do idioma
 * salvo; senão a melhor do idioma padrão.
 */
function pickInitialVoice(list: VoiceInfo[]): VoiceInfo | undefined {
  const saved = readPref(PREF_KEYS.voice);
  const savedVoice = saved ? list.find((v) => v.id === saved) : undefined;
  if (savedVoice) return savedVoice;

  const lang = readPref(PREF_KEYS.language) ?? DEFAULT_LANGUAGE;
  return bestVoice(list.filter((v) => v.language === lang)) ?? bestVoice(list);
}
