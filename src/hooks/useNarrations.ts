'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SynthesisProgress, TtsEngine } from '@/engine';
import { errorMessage } from './useEngine';

export type NarrationStatus = 'running' | 'done' | 'error' | 'cancelled';

/** Um "par" do chat: o texto enviado e o áudio gerado para ele. */
export interface Narration {
  id: string;
  text: string;
  voiceId: string;
  /** Rótulo da voz no momento da geração (a seleção pode mudar depois). */
  voiceLabel: string;
  createdAt: number;
  status: NarrationStatus;
  progress: SynthesisProgress | null;
  audio?: { url: string; sizeBytes: number };
  error?: string;
}

export interface NarrationsState {
  items: Narration[];
  running: boolean;
  generate: (text: string, voiceId: string, voiceLabel: string) => void;
  cancel: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * Histórico de narrações no estilo chat: cada geração vira um item novo e os
 * anteriores permanecem (com player e download).
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
  const controllerRef = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  const running = items.some((i) => i.status === 'running');

  // Revoga todos os áudios e cancela a geração ao desmontar.
  useEffect(() => {
    const set = urls.current;
    return () => {
      controllerRef.current?.abort();
      set.forEach((u) => URL.revokeObjectURL(u));
      set.clear();
    };
  }, []);

  const patch = useCallback((id: string, changes: Partial<Narration>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, []);

  const generate = useCallback(
    (text: string, voiceId: string, voiceLabel: string) => {
      if (!engine || controllerRef.current) return;
      const controller = new AbortController();
      controllerRef.current = controller;

      const id = nextId();
      setItems((list) => [
        ...list,
        { id, text, voiceId, voiceLabel, createdAt: Date.now(), status: 'running', progress: null },
      ]);

      engine
        .synthesize(text, voiceId, { signal: controller.signal, onProgress: (progress) => patch(id, { progress }) })
        .then((blob) => {
          if (controller.signal.aborted) return patch(id, { status: 'cancelled', progress: null });
          const url = URL.createObjectURL(blob);
          urls.current.add(url);
          patch(id, { status: 'done', progress: null, audio: { url, sizeBytes: blob.size } });
        })
        .catch((err) => {
          patch(
            id,
            controller.signal.aborted
              ? { status: 'cancelled', progress: null }
              : { status: 'error', progress: null, error: errorMessage(err) },
          );
        })
        .finally(() => {
          if (controllerRef.current === controller) controllerRef.current = null;
        });
    },
    [engine, patch],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const remove = useCallback((id: string) => {
    setItems((list) => {
      const item = list.find((i) => i.id === id);
      if (item?.audio) {
        URL.revokeObjectURL(item.audio.url);
        urls.current.delete(item.audio.url);
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

  return { items, running, generate, cancel, remove, clear };
}
