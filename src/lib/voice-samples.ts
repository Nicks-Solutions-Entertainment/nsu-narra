import samples from '@/data/voice-samples.json';

/**
 * Amostras de preview pré-gravadas (OGG Opus) em `public/samples/`.
 * Geradas por `scripts/samples/generate_samples.py` a partir de
 * `voice-demos/voice-exemples_<lang>.md`.
 */

export interface SamplePhrase {
  text: string;
  source: string;
}

interface LanguageSamples {
  phrases: SamplePhrase[];
  voices: string[];
}

const INDEX = samples as Record<string, LanguageSamples>;
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Frase sorteada por idioma, fixa durante o carregamento da página. */
const sessionPick = new Map<string, number>();

/**
 * Índice (0-based) da frase desta sessão para o idioma.
 * Sorteado na primeira chamada — só no cliente (eventos/efeitos), nunca no
 * HTML estático, para não haver diferença na hidratação.
 */
function phraseIndex(language: string): number | null {
  const entry = INDEX[language];
  if (!entry?.phrases.length) return null;
  let n = sessionPick.get(language);
  if (n === undefined) {
    n = Math.floor(Math.random() * entry.phrases.length);
    sessionPick.set(language, n);
  }
  return n;
}

/** Frase do preview desta sessão para o idioma (ou `null` se não houver). */
export function sessionPhrase(language: string): SamplePhrase | null {
  const n = phraseIndex(language);
  return n === null ? null : INDEX[language].phrases[n];
}

/** URL do OGG pré-gravado da voz com a frase da sessão, se existir. */
export function localSampleUrl(voiceId: string, language: string): string | null {
  if (!INDEX[language]?.voices.includes(voiceId)) return null;
  const n = phraseIndex(language);
  return n === null ? null : `${basePath}/samples/${language}/${encodeURIComponent(voiceId)}/${n + 1}.ogg`;
}

/** `true` se a voz tem amostra local (sem sortear nada). */
export function hasLocalSample(voiceId: string, language: string): boolean {
  return INDEX[language]?.voices.includes(voiceId) ?? false;
}

let oggSupport: boolean | undefined;

/** O navegador toca OGG Opus? (Safari antigo não.) Memoizado. */
export function canPlayOgg(): boolean {
  if (oggSupport === undefined) {
    oggSupport = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs=opus') !== '';
  }
  return oggSupport;
}
