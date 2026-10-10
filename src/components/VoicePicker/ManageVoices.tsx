import type { VoiceInfo } from '@/engine';
import { formatBytes, formatVoiceName } from '@/lib/format';
import { languageLabel } from '@/lib/languages';
import { ConfirmButton } from '../ConfirmButton/ConfirmButton';
import { Icon } from '../Icon/Icon';
import styles from './VoicePicker.module.css';

interface ManageVoicesProps {
  installed: VoiceInfo[];
  installedBytes: number;
  disabled: boolean;
  onRemove: (ids: string | string[]) => void;
}

/**
 * Vozes salvas no aparelho (todos os idiomas), com espaço ocupado,
 * remoção individual e "remover todas" — ambas com confirmação.
 */
export function ManageVoices({ installed, installedBytes, disabled, onRemove }: ManageVoicesProps) {
  if (installed.length === 0) {
    return <p className={styles.empty}>Nenhuma voz salva neste aparelho.</p>;
  }

  return (
    <div className={styles.manage}>
      <ul className={styles.manageList}>
        {installed.map((v) => (
          <li key={v.id} className={styles.manageRow}>
            <span className={styles.rowName}>{formatVoiceName(v.name)}</span>
            <span className={styles.rowMeta}>
              {languageLabel(v.language)} · {formatBytes(v.sizeBytes)}
            </span>
            <ConfirmButton
              className={styles.manageRemove}
              confirmLabel="Remover?"
              ariaLabel={`Remover ${formatVoiceName(v.name)} do aparelho`}
              onConfirm={() => onRemove(v.id)}
              disabled={disabled}
            >
              <Icon name="trash" size={15} />
            </ConfirmButton>
          </li>
        ))}
      </ul>

      <div className={styles.manageFooter}>
        <span>
          {installed.length} {installed.length === 1 ? 'voz ocupa' : 'vozes ocupam'} {formatBytes(installedBytes)}
        </span>
        <ConfirmButton
          confirmLabel={`Remover ${installed.length}?`}
          ariaLabel="Remover todas as vozes do aparelho"
          onConfirm={() => onRemove(installed.map((v) => v.id))}
          disabled={disabled}
        >
          Remover todas
        </ConfirmButton>
      </div>
    </div>
  );
}
