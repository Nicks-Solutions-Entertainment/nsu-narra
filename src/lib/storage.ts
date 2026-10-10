/**
 * Acesso seguro ao `localStorage` para preferências por usuário
 * (voz escolhida, rascunho do texto, "enviar com Enter").
 *
 * Nunca lança: em aba anônima, armazenamento bloqueado ou SSR, apenas
 * retorna o valor padrão / ignora a escrita.
 */
export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* armazenamento indisponível: preferência não é persistida */
  }
}

/** Chaves usadas pelo app, centralizadas para evitar colisões. */
export const PREF_KEYS = {
  voice: 'narra:voice',
  language: 'narra:language',
  draft: 'narra:draft',
  enterToSend: 'narra:enter-to-send',
  commercialOnly: 'narra:commercial-only',
} as const;
