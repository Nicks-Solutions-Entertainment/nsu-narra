/** Idioma pré-selecionado quando não há preferência salva. */
export const DEFAULT_LANGUAGE = 'pt_BR';

const cache = new Map<string, string>();
let displayNames: Intl.DisplayNames | null | undefined;

/**
 * Nome legível de um código de idioma do Piper, em português.
 * Ex.: `pt_BR` → "Português (Brasil)", `en_GB` → "Inglês (Reino Unido)".
 *
 * Usa `Intl.DisplayNames` (sem tabela própria) e memoiza o resultado, já que
 * a lista de idiomas é renderizada a cada mudança de seleção.
 */
export function languageLabel(code: string): string {
  const hit = cache.get(code);
  if (hit) return hit;

  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['pt-BR'], { type: 'language' });
    } catch {
      displayNames = null;
    }
  }

  let label = code;
  try {
    label = displayNames?.of(code.replace('_', '-')) ?? code;
  } catch {
    /* código desconhecido pelo navegador: mostra o código */
  }
  label = label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
  cache.set(code, label);
  return label;
}
