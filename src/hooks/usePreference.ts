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
