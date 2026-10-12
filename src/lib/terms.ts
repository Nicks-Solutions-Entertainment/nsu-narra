'use client';

import { useSyncExternalStore } from 'react';
import { PREF_KEYS, readPref, writePref } from './storage';
import { TERMS_VERSION } from './terms-content';

const EVENT = 'narra:terms';

/** `true`/`false` no cliente; `null` no HTML estático (ainda não se sabe). */
type Acceptance = boolean | null;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange); // outras abas
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

const read = (): Acceptance => readPref(PREF_KEYS.termsAccepted) === TERMS_VERSION;

/**
 * O usuário aceitou a versão atual dos termos? `null` durante a renderização
 * estática, para o aviso não piscar nem divergir na hidratação.
 */
export function useTermsAccepted(): Acceptance {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** Registra o aceite da versão atual (e avisa os componentes abertos). */
export function acceptTerms(): void {
  writePref(PREF_KEYS.termsAccepted, TERMS_VERSION);
  window.dispatchEvent(new Event(EVENT));
}
