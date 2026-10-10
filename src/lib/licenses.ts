import type { CommercialUse } from '@/engine';

/** Rótulo curto da situação de uso comercial. */
export const COMMERCIAL_LABEL: Record<CommercialUse, string> = {
  yes: 'Permite uso comercial',
  no: 'Não permite uso comercial',
  unclear: 'Uso comercial incerto',
};

/** Resumo, em linguagem simples, do que cada família de licença permite. */
const SUMMARIES: [RegExp, string][] = [
  [/^CC0$|Domínio público|Unlicense/i, 'Domínio público: uso livre, inclusive comercial, sem exigir crédito.'],
  [/BY-NC-ND/i, 'Somente uso não comercial, com crédito ao autor e sem modificar o modelo.'],
  [/BY-NC-SA/i, 'Somente uso não comercial, com crédito; derivados devem usar a mesma licença.'],
  [/BY-NC/i, 'Somente uso não comercial, com crédito ao autor.'],
  [/BY-SA/i, 'Uso livre, inclusive comercial, com crédito; derivados devem usar a mesma licença.'],
  [/BY-ND/i, 'Uso livre, inclusive comercial, com crédito e sem modificar o modelo.'],
  [/CC BY/i, 'Uso livre, inclusive comercial, desde que dê crédito ao autor.'],
  [/^MIT$/i, 'Permissiva: uso livre, inclusive comercial; mantenha o aviso de licença.'],
  [/Apache/i, 'Permissiva: uso livre, inclusive comercial; mantenha o aviso de licença.'],
  [/AGPL|GPL/i, 'Permite uso comercial; quem distribui o modelo modificado deve abrir o código.'],
  [/Blizzard|pesquisa/i, 'Somente pesquisa: proíbe qualquer uso comercial.'],
];

/** Explicação da licença para leigos (ou `null` se desconhecida). */
export function licenseSummary(license: string): string | null {
  return SUMMARIES.find(([re]) => re.test(license))?.[1] ?? null;
}

/** Texto completo para tooltip: licença, situação, resumo e observação. */
export function licenseTooltip(v: { license: string; commercial: CommercialUse; licenseNote?: string }): string {
  return [`${v.license} — ${COMMERCIAL_LABEL[v.commercial]}.`, licenseSummary(v.license), v.licenseNote]
    .filter(Boolean)
    .join('\n');
}
