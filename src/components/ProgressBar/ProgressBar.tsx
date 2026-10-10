import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  /** 0–100. `null` mostra barra indeterminada. */
  value: number | null;
  label: string;
}

/** Barra de progresso acessível (determinada ou indeterminada). */
export function ProgressBar({ value, label }: ProgressBarProps) {
  const indeterminate = value === null;
  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : value}
    >
      <div
        className={indeterminate ? `${styles.bar} ${styles.indeterminate}` : styles.bar}
        style={indeterminate ? undefined : { transform: `scaleX(${value / 100})` }}
      />
    </div>
  );
}
