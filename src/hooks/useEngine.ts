'use client';

import { useEffect, useState } from 'react';
import { createEngine, type TtsEngine } from '@/engine';

export interface EngineState {
  engine: TtsEngine | null;
  error: string | null;
}

/**
 * Cria o motor de TTS uma única vez por montagem e o libera ao desmontar.
 *
 * O motor é escolhido em tempo de execução (`createEngine`), por isso a
 * criação acontece em `useEffect` (só no navegador, nunca no build estático).
 */
export function useEngine(): EngineState {
  const [state, setState] = useState<EngineState>({ engine: null, error: null });

  useEffect(() => {
    let disposed = false;
    let created: TtsEngine | null = null;

    createEngine()
      .then((engine) => {
        if (disposed) return engine.dispose?.();
        created = engine;
        setState({ engine, error: null });
      })
      .catch((err: unknown) => {
        if (!disposed) setState({ engine: null, error: errorMessage(err) });
      });

    return () => {
      disposed = true;
      created?.dispose?.();
    };
  }, []);

  return state;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
