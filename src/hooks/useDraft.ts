'use client';

import { useEffect, useState } from 'react';
import { PREF_KEYS, readPref, writePref } from '@/lib/storage';

/** Intervalo sem digitação antes de salvar o rascunho. */
const SAVE_DELAY_MS = 500;

/**
 * Texto do usuário com rascunho salvo no `localStorage`.
 *
 * Desempenho: a gravação é adiada (debounce) para não escrever no disco a
 * cada tecla; só o último valor após uma pausa de digitação é salvo.
 */
export function useDraft(): [string, (value: string) => void] {
  const [text, setText] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Restaura o rascunho no cliente (não existe no HTML estático).
  useEffect(() => {
    const saved = readPref(PREF_KEYS.draft);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do localStorage após hidratar
    if (saved) setText(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => writePref(PREF_KEYS.draft, text || null), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, hydrated]);

  return [text, setText];
}
