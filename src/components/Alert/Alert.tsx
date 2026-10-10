import type { ReactNode } from 'react';
import styles from './Alert.module.css';

interface AlertProps {
  children: ReactNode;
  tone?: 'error' | 'info';
  action?: ReactNode;
}

/** Mensagem de erro/aviso anunciada a leitores de tela. */
export function Alert({ children, tone = 'error', action }: AlertProps) {
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {action}
    </div>
  );
}
