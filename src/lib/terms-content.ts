/**
 * Dados dos Termos de Uso usados pelo aviso e pela página `/terms`.
 * Sem 'use client': a página de termos é gerada no build e lê daqui.
 */

/**
 * Versão dos Termos de Uso. Mudou o texto de forma relevante? Suba a data:
 * quem aceitou uma versão anterior verá o aviso de novo.
 */
export const TERMS_VERSION = '2026-10-12';

/** Rota da página de termos (sem basePath; o `Link` do Next o acrescenta). */
export const TERMS_PATH = '/terms/';

/** Resumo exibido no aviso de primeiro acesso e no topo da página de termos. */
export const TERMS_SUMMARY = [
  'O Narra gera áudio com modelos de IA, direto no seu aparelho; o texto e o áudio não vão para servidores.',
  'Cada voz tem a própria licença. Algumas não permitem uso comercial: confira o ⚖ ao lado da voz.',
  'Ao publicar um áudio, informe que ele foi gerado por IA.',
  'Não use para se passar por outra pessoa sem consentimento, enganar, assediar, discriminar, dar aconselhamento médico ou violar a lei.',
  'O áudio gerado é seu, e a responsabilidade pelo uso também. O app é oferecido sem garantias.',
] as const;
