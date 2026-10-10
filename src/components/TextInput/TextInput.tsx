import { useId } from 'react';
import { formatCount } from '@/lib/format';
import styles from './TextInput.module.css';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Limite opcional de caracteres (evita gerações enormes no celular). */
  maxLength?: number;
}

/** Caixa de texto do roteiro com contador de caracteres. */
export function TextInput({ value, onChange, disabled, maxLength }: TextInputProps) {
  const id = useId();
  const counterId = `${id}-count`;

  return (
    <div className={styles.wrapper}>
      <label htmlFor={id} className="section-title">
        2. Texto
      </label>
      <textarea
        id={id}
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        rows={8}
        spellCheck
        lang="pt-BR"
        placeholder="Digite ou cole aqui o texto que será narrado…"
        aria-describedby={counterId}
      />
      <div id={counterId} className={styles.counter}>
        {formatCount(value.length)}
        {maxLength ? ` / ${formatCount(maxLength)}` : ''} caracteres
      </div>
    </div>
  );
}
