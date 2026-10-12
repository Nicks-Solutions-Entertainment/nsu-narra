'use client';

import { useCallback, useEffect, useState } from 'react';
import { readPref, writePref } from '@/lib/storage';

/**
 * Preferência booleana persistida no `localStorage` (ex.: "enviar com Enter").
 *
 * O valor salvo é lido após a hidratação, porque o HTML estático não conhece
 * o `localStorage`; até lá vale `defaultValue`.
 */
export function useBooleanPreference(key: string, defaultValue: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const saved = readPref(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do localStorage após hidratar
    if (saved !== null) setValue(saved === 'true');
  }, [key]);

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      writePref(key, String(next));
    },
    [key],
  );

  return [value, update];
}

/**
 * Preferência numérica persistida no `localStorage` (ex.: velocidade da voz).
 * Valores salvos fora de `[min, max]` são ignorados.
 */
export function useNumberPreference(
  key: string,
  defaultValue: number,
  { min, max }: { min: number; max: number },
): [number, (value: number) => void] {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const saved = Number(readPref(key) ?? NaN);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do localStorage após hidratar
    if (saved >= min && saved <= max) setValue(saved);
  }, [key, min, max]);

  const update = useCallback(
    (next: number) => {
      setValue(next);
      writePref(key, String(next));
    },
    [key],
  );

  return [value, update];
}
