import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Narra — Narração PT-BR',
  description: 'Gere narração em português a partir de texto com vozes Piper, direto no seu aparelho.',
  manifest: `${basePath}/manifest.webmanifest`,
  icons: { icon: `${basePath}/icon.svg` },
  appleWebApp: { capable: true, title: 'Narra', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0e10' },
  ],
};

/**
 * Configuração do `coi-serviceworker`, que habilita cross-origin isolation
 * (COOP/COEP) no GitHub Pages para o WASM usar várias threads.
 * Não registra dentro do Tauri, onde não há service worker útil.
 */
const COI_CONFIG = `window.coi={shouldRegister:function(){return !window.__TAURI_INTERNALS__}};`;

/** Layout raiz: HTML base, metadados de PWA e service worker de isolamento. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: COI_CONFIG }} />
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- precisa rodar antes de tudo para recarregar isolado */}
        <script src={`${basePath}/coi-serviceworker.js`} />
      </head>
      <body>{children}</body>
    </html>
  );
}
