'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TtsEngine, VoiceInfo } from '@/engine';
import { PREF_KEYS, readPref, writePref } from '@/lib/storage';
import { errorMessage } from './useEngine';

/** Percentual de download por id de voz (apenas downloads em andamento). */
export type DownloadMap = Readonly<Record<string, number>>;

export interface VoicesState {
  voices: VoiceInfo[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  downloads: DownloadMap;
  select: (id: string) => void;
  download: (id: string) => Promise<void>;
  cancelDownload: (id: string) => void;
  remove: (id: string) => Promise<void>;
  reload: () => void;
}

/**
 * Estado do catálogo de vozes: listagem, seleção, download e remoção.
 *
 * Desempenho:
 *  - O catálogo é carregado uma vez; depois de baixar/remover, o estado é
 *    atualizado localmente em vez de listar tudo de novo.
 *  - Callbacks estáveis (`useCallback`) para que componentes memoizados
 *    não re-renderizem enquanto o usuário digita.
 */
export function useVoices(engine: TtsEngine | null): VoicesState {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        setVoices(list);
        setSelectedId((current) => current ?? pickInitialVoice(list));
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

  const select = useCallback((id: string) => {
    setSelectedId(id);
    writePref(PREF_KEYS.voice, id);
  }, []);

  const patchVoice = useCallback((id: string, patch: Partial<VoiceInfo>) => {
    setVoices((list) => list.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }, []);

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
        patchVoice(id, { installed: true });
        setSelectedId((current) => current ?? id);
      } catch (err) {
        if (!controller.signal.aborted) setError(errorMessage(err));
      } finally {
        controllers.current.delete(id);
        setProgress(id, null);
      }
    },
    [engine, patchVoice, setProgress],
  );

  const cancelDownload = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  const remove = useCallback(
    async (id: string) => {
      if (!engine) return;
      try {
        await engine.removeVoice(id);
        patchVoice(id, { installed: false });
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [engine, patchVoice],
  );

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  return { voices, loading, error, selectedId, downloads, select, download, cancelDownload, remove, reload };
}

/**
 * Escolhe a voz inicial: a última usada (se ainda existir), senão a primeira
 * instalada, senão a primeira `medium` (melhor relação qualidade/velocidade).
 */
function pickInitialVoice(list: VoiceInfo[]): string | null {
  const saved = readPref(PREF_KEYS.voice);
  if (saved && list.some((v) => v.id === saved)) return saved;
  return (
    list.find((v) => v.installed)?.id ??
    list.find((v) => v.quality === 'medium')?.id ??
    list[0]?.id ??
    null
  );
}
