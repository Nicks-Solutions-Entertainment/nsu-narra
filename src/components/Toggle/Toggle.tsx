import styles from './Toggle.module.css';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Texto auxiliar exibido como tooltip. */
  title?: string;
}

/** Interruptor liga/desliga acessível (`role="switch"`). */
export function Toggle({ checked, onChange, label, title }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={styles.toggle}
      onClick={() => onChange(!checked)}
      title={title}
    >
      <span className={styles.track} data-on={checked}>
        <span className={styles.thumb} />
      </span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
