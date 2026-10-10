import { type ReactNode, useEffect, useState } from 'react';
import styles from './ConfirmButton.module.css';

/** Tempo que o botão fica "armado" esperando a confirmação. */
const ARM_TIMEOUT_MS = 3500;

interface ConfirmButtonProps {
  /** Conteúdo no estado normal (ex.: ícone de lixeira). */
  children: ReactNode;
  /** Texto do segundo passo (ex.: "Remover?"). */
  confirmLabel: string;
  /** Rótulo acessível do estado normal. */
  ariaLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Ação destrutiva em dois passos: o 1º clique "arma" o botão (fica vermelho
 * com `confirmLabel`), o 2º executa. Volta ao normal sozinho após alguns
 * segundos — evita exclusões acidentais sem abrir um diálogo modal.
 */
export function ConfirmButton({ children, confirmLabel, ariaLabel, onConfirm, disabled, className }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={`${styles.button} ${armed ? styles.armed : ''} ${className ?? ''}`}
      disabled={disabled}
      aria-label={armed ? `${confirmLabel} Clique de novo para confirmar.` : ariaLabel}
      title={armed ? 'Clique de novo para confirmar' : ariaLabel}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
