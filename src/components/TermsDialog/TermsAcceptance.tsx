'use client';

import { acceptTerms, useTermsAccepted } from '@/lib/terms';
import styles from './TermsDialog.module.css';

/** Rodapé da página de termos: botão de aceite ou confirmação de que já aceitou. */
export function TermsAcceptance() {
  const accepted = useTermsAccepted();
  if (accepted === null) return null; // HTML estático: decide após hidratar

  return (
    <div className={styles.acceptance} data-accepted={accepted}>
      {accepted ? (
        <p>✓ Você já aceitou esta versão dos termos.</p>
      ) : (
        <>
          <p>Para usar o Narra, confirme que leu e concorda com estes termos.</p>
          <button type="button" className="btn btn-primary" onClick={acceptTerms}>
            Li e concordo
          </button>
        </>
      )}
    </div>
  );
}
