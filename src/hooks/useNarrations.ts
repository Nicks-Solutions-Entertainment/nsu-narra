'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SynthesisProgress, SynthesizeOptions, TtsEngine } from '@/engine';
import { errorMessage } from './useEngine';

export type NarrationStatus = 'running' | 'done' | 'error' | 'cancelled';

/** Ajustes de voz repassados ao motor (passos só valem para o Supertonic). */
export type Tuning = Pick<SynthesizeOptions, 'steps' | 'speed' | 'variation'>;

/** Uma geração de áudio para o texto. "Regerar" acrescenta versões ao mesmo item. */
export interface NarrationVersion {
  id: string;
  /** Ajustes usados (reaproveitados ao regerar). */
  tuning: Tuning;
  createdAt: number;
  status: NarrationStatus;
  progress: SynthesisProgress | null;
  /** WAV gerado; `blob` é a fonte das conversões do menu de download. */
  audio?: { url: string; blob: Blob; sizeBytes: number; sampleRate: number; durationSec: number };
  error?: string;
}

/** Um "par" do chat: o texto enviado e as versões de áudio geradas para ele. */
export interface Narration {
  id: string;
  text: string;
  voiceId: string;
  /** Rótulo da voz no momento da geração (a seleção pode mudar depois). */
  voiceLabel: string;
  /** Sempre com ao menos uma versão. */
  versions: NarrationVersion[];
  /** Índice da versão exibida (como o "< 2 / 3 >" do ChatGPT). */
  active: number;
}

export interface NarrationsState {
  items: Narration[];
  running: boolean;
  generate: (text: string, voiceId: string, voiceLabel: string, tuning?: Tuning) => void;
  /** Gera uma nova versão do item, com o mesmo texto, voz e ajustes da versão exibida. */
  regenerate: (id: string) => void;
  /** Troca a versão exibida de um item. */
  selectVersion: (id: string, index: number) => void;
  cancel: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * Histórico de narrações no estilo chat: cada envio vira um item novo e os
 * anteriores permanecem (com player e download). "Regerar" cria uma nova
 * versão dentro do próprio item, navegável por "< 1 / 2 >".
 *
 * Desempenho / memória:
 *  - Atualizações de progresso trocam só o item em geração; os demais mantêm
 *    a mesma referência e não re-renderizam (componentes memoizados).
 *  - Cada áudio é um object URL; ele é revogado ao remover o item, ao limpar
 *    o histórico ou ao desmontar, liberando o Blob (que pode ter dezenas de MB).
 *  - Uma geração por vez (o motor carrega um modelo por vez).
 */
export function useNarrations(engine: TtsEngine | null): NarrationsState {
  const [items, setItems] = useState<Narration[]>([]);
  // Leitura do estado atual em callbacks estáveis (ex.: `regenerate`).
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const controllerRef = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  const running = items.some((i) => i.versions.some((v) => v.status === 'running'));

  // Revoga todos os áudios e cancela a geração ao desmontar.
  useEffect(() => {
    const set = urls.current;
    return () => {
      controllerRef.current?.abort();
      set.forEach((u) => URL.revokeObjectURL(u));
      set.clear();
    };
  }, []);

  const patchVersion = useCallback((itemId: string, versionId: string, changes: Partial<NarrationVersion>) => {
    setItems((list) =>
      list.map((it) =>
        it.id === itemId
          ? { ...it, versions: it.versions.map((v) => (v.id === versionId ? { ...v, ...changes } : v)) }
          : it,
      ),
    );
  }, []);

  /** Sintetiza uma versão já adicionada ao estado. */
  const synthesize = useCallback(
    (item: Pick<Narration, 'id' | 'text' | 'voiceId'>, version: NarrationVersion) => {
      if (!engine) return;
      const controller = new AbortController();
      controllerRef.current = controller;
      const patch = (changes: Partial<NarrationVersion>) => patchVersion(item.id, version.id, changes);

      engine
        .synthesize(item.text, item.voiceId, {
          ...version.tuning,
          signal: controller.signal,
          onProgress: (progress) => patch({ progress }),
        })
        .then(async (blob) => {
          if (controller.signal.aborted) return patch({ status: 'cancelled', progress: null });
          // Taxa do cabeçalho WAV (44 bytes, PCM 16-bit mono) para estimar os tamanhos.
          const sampleRate = new DataView(await blob.slice(0, 44).arrayBuffer()).getUint32(24, true);
          const durationSec = sampleRate ? (blob.size - 44) / 2 / sampleRate : 0;
          const url = URL.createObjectURL(blob);
          urls.current.add(url);
          patch({ status: 'done', progress: null, audio: { url, blob, sizeBytes: blob.size, sampleRate, durationSec } });
        })
        .catch((err) => {
          patch(
            controller.signal.aborted
              ? { status: 'cancelled', progress: null }
              : { status: 'error', progress: null, error: errorMessage(err) },
          );
        })
        .finally(() => {
          if (controllerRef.current === controller) controllerRef.current = null;
        });
    },
    [engine, patchVersion],
  );

  const generate = useCallback(
    (text: string, voiceId: string, voiceLabel: string, tuning: Tuning = {}) => {
      if (!engine || controllerRef.current) return;
      const item = { id: nextId(), text, voiceId };
      const version = newVersion(tuning);
      setItems((list) => [...list, { ...item, voiceLabel, versions: [version], active: 0 }]);
      synthesize(item, version);
    },
    [engine, synthesize],
  );

  const regenerate = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!engine || !item || controllerRef.current) return;
      const version = newVersion(item.versions[item.active].tuning);
      setItems((list) =>
        list.map((it) =>
          it.id === id ? { ...it, versions: [...it.versions, version], active: it.versions.length } : it,
        ),
      );
      synthesize(item, version);
    },
    [engine, synthesize],
  );

  const selectVersion = useCallback((id: string, index: number) => {
    setItems((list) =>
      list.map((it) =>
        it.id === id && index >= 0 && index < it.versions.length && index !== it.active ? { ...it, active: index } : it,
      ),
    );
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const remove = useCallback((id: string) => {
    setItems((list) => {
      for (const v of list.find((i) => i.id === id)?.versions ?? []) {
        if (!v.audio) continue;
        URL.revokeObjectURL(v.audio.url);
        urls.current.delete(v.audio.url);
      }
      return list.filter((i) => i.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    setItems([]);
  }, []);

  return { items, running, generate, regenerate, selectVersion, cancel, remove, clear };
}

function newVersion(tuning: Tuning): NarrationVersion {
  return { id: nextId(), tuning, createdAt: Date.now(), status: 'running', progress: null };
}
