'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SynthesisProgress, TtsEngine } from '@/engine';
import { errorMessage } from './useEngine';

export type SynthesisStatus = 'idle' | 'running' | 'done' | 'error';

export interface GeneratedAudio {
  url: string;
  voiceId: string;
  sizeBytes: number;
}

export interface SynthesisState {
  status: SynthesisStatus;
  progress: SynthesisProgress | null;
  audio: GeneratedAudio | null;
  error: string | null;
  generate: (text: string, voiceId: string) => Promise<void>;
  cancel: () => void;
}

/**
 * Controla uma geração de áudio por vez: progresso, cancelamento e resultado.
 *
 * Desempenho / memória:
 *  - Cada resultado vira um object URL; o anterior é revogado ao gerar outro
 *    ou ao desmontar, liberando o Blob (que pode ter dezenas de MB).
 *  - Uma nova geração cancela a anterior em vez de rodar em paralelo.
 */
export function useSynthesis(engine: TtsEngine | null): SynthesisState {
  const [status, setStatus] = useState<SynthesisStatus>('idle');
  const [progress, setProgress] = useState<SynthesisProgress | null>(null);
  const [audio, setAudio] = useState<GeneratedAudio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Revoga o object URL anterior sempre que o áudio muda ou o hook desmonta.
  useEffect(() => {
    if (!audio) return;
    return () => URL.revokeObjectURL(audio.url);
  }, [audio]);

  // Cancela a geração em andamento ao desmontar.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const generate = useCallback(
    async (text: string, voiceId: string) => {
      if (!engine) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setStatus('running');
      setProgress(null);
      setError(null);

      try {
        const blob = await engine.synthesize(text, voiceId, {
          signal: controller.signal,
          onProgress: setProgress,
        });
        if (controller.signal.aborted) return;
        setAudio({ url: URL.createObjectURL(blob), voiceId, sizeBytes: blob.size });
        setStatus('done');
      } catch (err) {
        if (controller.signal.aborted) {
          setStatus('idle');
          return;
        }
        setError(errorMessage(err));
        setStatus('error');
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [engine],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setStatus('idle');
    setProgress(null);
  }, []);

  return { status, progress, audio, error, generate, cancel };
}
