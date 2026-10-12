/**
 * Ajustes de voz expostos na UI (botão de configuração ao lado da voz):
 *  - velocidade: multiplicador sobre o ritmo padrão do app (`SPEECH_PACE`),
 *    vale para todas as famílias; é a base da variação de ritmo;
 *  - passos: refinamentos do modelo Supertonic (qualidade × tempo).
 * Sem dependências: a UI e o worker importam.
 */

export interface TuningRange {
  min: number;
  max: number;
  step: number;
}

/** Velocidade relativa ao ritmo padrão do app (1 = normal). */
export const SPEED_RANGE: TuningRange = { min: 0.7, max: 1.3, step: 0.05 };
export const DEFAULT_SPEED = 1;

/** Passos de refinamento do Supertonic (o SDK recomenda 5–12). */
export const STEPS_RANGE: TuningRange = { min: 2, max: 16, step: 1 };
export const DEFAULT_STEPS = 8;

/** Variação máxima da velocidade entre trechos (0 = ritmo constante; 0,03 = ±3%). */
export const VARIATION_RANGE: TuningRange = { min: 0, max: 0.1, step: 0.01 };
export const DEFAULT_VARIATION = 0.03;

/**
 * Velocidade de cada trecho: a base com uma variação aleatória de até
 * ±`variation`, centrada para que a média dos trechos seja exatamente a base
 * (o texto como um todo mantém o ritmo escolhido). Um trecho só = a base.
 */
export function chunkSpeeds(base: number, count: number, variation = 0, random = Math.random): number[] {
  if (count < 2 || variation <= 0) return Array.from({ length: count }, () => base);

  const offsets = Array.from({ length: count }, () => (random() * 2 - 1) * variation);
  const mean = offsets.reduce((a, b) => a + b, 0) / count;
  const centered = offsets.map((d) => d - mean);
  // Centralizar pode passar do limite; reescalar mantém a média zero.
  const peak = Math.max(...centered.map(Math.abs));
  const scale = peak > variation ? variation / peak : 1;
  return centered.map((d) => base * (1 + d * scale));
}
