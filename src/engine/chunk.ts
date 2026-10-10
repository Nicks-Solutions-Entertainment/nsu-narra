/**
 * Divide um texto em trechos de até `maxLen` caracteres, respeitando frases.
 *
 * Por que: gerar por trecho limita o pico de memória (importante no celular),
 * permite mostrar progresso "trecho X de Y" e cancelar entre trechos.
 *
 * - Agrupa frases curtas no mesmo trecho (menos chamadas ao modelo).
 * - Frases maiores que `maxLen` são quebradas por palavras.
 * - Complexidade O(n) no tamanho do texto.
 *
 * @param text   Texto bruto digitado pelo usuário.
 * @param maxLen Tamanho máximo de cada trecho (padrão 300).
 * @returns Trechos não vazios, na ordem original.
 */
export function splitSentences(text: string, maxLen = 300): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= maxLen) return [normalized];

  const sentences = normalized.match(/[^.!?…;:]+[.!?…;:]*/g) ?? [normalized];
  const out: string[] = [];
  let buf = '';

  const flush = () => {
    if (buf) out.push(buf);
    buf = '';
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (sentence.length > maxLen) {
      flush();
      for (const piece of splitByWords(sentence, maxLen)) out.push(piece);
      continue;
    }

    if (buf && buf.length + 1 + sentence.length > maxLen) flush();
    buf = buf ? `${buf} ${sentence}` : sentence;
  }
  flush();
  return out;
}

/** Quebra uma frase longa em pedaços de até `maxLen`, sem cortar palavras. */
function splitByWords(sentence: string, maxLen: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const word of sentence.split(' ')) {
    if (piece && piece.length + 1 + word.length > maxLen) {
      pieces.push(piece);
      piece = word;
    } else {
      piece = piece ? `${piece} ${word}` : word;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}
