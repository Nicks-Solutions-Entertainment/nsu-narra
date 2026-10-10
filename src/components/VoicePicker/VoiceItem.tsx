import { memo } from 'react';
import type { VoiceInfo } from '@/engine';
import { formatBytes, formatQuality, formatVoiceName } from '@/lib/format';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import styles from './VoicePicker.module.css';

export interface VoiceItemProps {
  voice: VoiceInfo;
  selected: boolean;
  /** Percentual do download em andamento; `undefined` se não está baixando. */
  downloadPct?: number;
  disabled: boolean;
  onSelect: (id: string) => void;
  onDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Linha do seletor: escolher, baixar (com progresso), cancelar ou remover.
 * Memoizada: só re-renderiza quando a própria voz ou seu progresso mudam.
 */
export const VoiceItem = memo(function VoiceItem({
  voice,
  selected,
  downloadPct,
  disabled,
  onSelect,
  onDownload,
  onCancelDownload,
  onRemove,
}: VoiceItemProps) {
  const downloading = downloadPct !== undefined;
  const name = formatVoiceName(voice.name);

  return (
    <li className={selected ? `${styles.item} ${styles.selected}` : styles.item}>
      <label className={styles.choice}>
        <input
          type="radio"
          name="voice"
          value={voice.id}
          checked={selected}
          disabled={disabled || !voice.installed}
          onChange={() => onSelect(voice.id)}
        />
        <span className={styles.meta}>
          <span className={styles.name}>
            {name}
            {voice.installed && <span className={styles.badge}>instalada</span>}
          </span>
          <span className={styles.details}>
            qualidade {formatQuality(voice.quality)}
            {voice.sizeBytes ? ` · ${formatBytes(voice.sizeBytes)}` : ''}
          </span>
        </span>
      </label>

      <div className={styles.actions}>
        {downloading ? (
          <>
            <span className={styles.pct}>{downloadPct}%</span>
            <button type="button" className="btn btn-ghost" onClick={() => onCancelDownload(voice.id)}>
              Cancelar
            </button>
          </>
        ) : voice.installed ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() => onRemove(voice.id)}
            aria-label={`Remover voz ${name}`}
          >
            Remover
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={disabled}
            onClick={() => onDownload(voice.id)}
            aria-label={`Baixar voz ${name}`}
          >
            Baixar
          </button>
        )}
      </div>

      {downloading && (
        <div className={styles.progress}>
          <ProgressBar value={downloadPct} label={`Baixando ${name}`} />
        </div>
      )}
    </li>
  );
});
