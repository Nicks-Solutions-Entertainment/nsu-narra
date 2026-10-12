'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { TERMS_PATH } from '@/lib/terms-content';
import styles from './AppHeader.module.css';

/** Itens do menu (caminhos sem basePath, com a barra final do `trailingSlash`). */
const NAV = [
  { href: '/', label: 'Narrar' },
  { href: TERMS_PATH, label: 'Termos e licenças' },
] as const;

/**
 * Cabeçalho comum: marca e menu em pílulas à esquerda; `children` à direita
 * (ex.: o motor em uso).
 */
export function AppHeader({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href.replace(/\/$/, '')));

  return (
    <header className={styles.header}>
      <div className={styles.start}>
        <span className={styles.brand}>Narra</span>
        <nav aria-label="Principal">
          <ul className={styles.nav}>
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={styles.pill}
                  aria-current={active(item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {children}
    </header>
  );
}
