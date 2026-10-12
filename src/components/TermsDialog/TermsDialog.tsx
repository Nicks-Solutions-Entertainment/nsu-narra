'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { acceptTerms, useTermsAccepted } from '@/lib/terms';
import { TERMS_PATH, TERMS_SUMMARY } from '@/lib/terms-content';
import styles from './TermsDialog.module.css';

/**
 * Aviso de primeiro acesso com o resumo dos Termos de Uso. Só some com o
 * aceite (Esc não fecha); fica oculto na própria página de termos, para ela
 * poder ser lida. `<dialog>` nativo: foco preso e fundo inerte de graça.
 */
export function TermsDialog() {
  const accepted = useTermsAccepted();
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const onTermsPage = pathname.startsWith(TERMS_PATH.replace(/\/$/, ''));
  const open = accepted === false && !onTermsPage;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="terms-title"
      onCancel={(e) => e.preventDefault()} // exige o aceite
    >
      <h2 id="terms-title" className={styles.title}>
        Antes de começar
      </h2>
      <p className={styles.lead}>Para usar o Narra, você precisa concordar com os Termos de Uso e as licenças das vozes:</p>
      <ul className={styles.list}>
        {TERMS_SUMMARY.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className={styles.actions}>
        <Link href={TERMS_PATH} className="btn btn-secondary">
          Ler os termos completos
        </Link>
        <button type="button" className="btn btn-primary" onClick={acceptTerms} autoFocus>
          Concordo
        </button>
      </div>
    </dialog>
  );
}
