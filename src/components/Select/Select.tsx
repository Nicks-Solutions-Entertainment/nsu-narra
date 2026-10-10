import type { ReactNode, SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  /** Rótulo acessível (lido por leitores de tela, não exibido). */
  label: string;
  onChange: (value: string) => void;
  children: ReactNode;
}

/**
 * `<select>` nativo com visual de "pílula" (como o seletor de modelo do Ollama).
 * Nativo de propósito: acessível, leve e com a lista do sistema no celular.
 */
export function Select({ label, onChange, children, className, ...rest }: SelectProps) {
  return (
    <label className={`${styles.wrapper} ${className ?? ''}`}>
      <span className="visually-hidden">{label}</span>
      <select className={styles.select} onChange={(e) => onChange(e.target.value)} {...rest}>
        {children}
      </select>
      <svg className={styles.chevron} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </label>
  );
}
