import type { SynthesisProgress } from '@/engine';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import styles from './GenerateControls.module.css';

interface GenerateControlsProps {
  running: boolean;
  progress: SynthesisProgress | null;
  /** Motivo pelo qual não é possível gerar (exibido como dica). */
  blockedReason: string | null;
  onGenerate: () => void;
  onCancel: () => void;
}

/** Botão Gerar/Cancelar com o estado "gerando trecho X de Y". */
export function GenerateControls({ running, progress, blockedReason, onGenerate, onCancel }: GenerateControlsProps) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        {running ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onGenerate} disabled={!!blockedReason}>
            Gerar áudio
          </button>
        )}
        <span className={styles.status} aria-live="polite">
          {running ? statusText(progress) : blockedReason}
        </span>
      </div>
      {running && <ProgressBar value={pct && pct > 0 ? pct : null} label="Progresso da geração" />}
    </div>
  );
}

function statusText(progress: SynthesisProgress | null): string {
  if (!progress || progress.done === 0) return 'Preparando a voz…';
  if (progress.total <= 1) return 'Gerando…';
  return `Gerando trecho ${Math.min(progress.done + 1, progress.total)} de ${progress.total}…`;
}
