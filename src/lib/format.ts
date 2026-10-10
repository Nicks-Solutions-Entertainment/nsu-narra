const bytesFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const countFormatter = new Intl.NumberFormat('pt-BR');
const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Formata bytes em KB/MB legíveis. Ex.: 63_201_294 → "60,3 MB". */
export function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${bytesFormatter.format(value)} ${units[unit]}`;
}

/** Formata contagens com separador de milhar pt-BR. */
export function formatCount(n: number): string {
  return countFormatter.format(n);
}

/** Hora curta, ex.: "14:05". */
export function formatTime(timestamp: number): string {
  return timeFormatter.format(timestamp);
}

/** Rótulos amigáveis para a qualidade do modelo. */
const QUALITY_LABEL: Record<string, string> = {
  x_low: 'muito baixa',
  low: 'baixa',
  medium: 'média',
  high: 'alta',
};

export function formatQuality(quality: string): string {
  return QUALITY_LABEL[quality] ?? quality;
}

/** Capitaliza o nome do locutor. Ex.: "jenny_dioco" → "Jenny dioco". */
export function formatVoiceName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
}

/** Nome de arquivo para download, com data/hora para não sobrescrever. */
export function audioFileName(voiceId: string, date = new Date()): string {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `narracao-${voiceId}-${stamp}.wav`;
}
