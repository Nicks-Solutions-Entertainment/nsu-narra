import { memo } from 'react';
import type { VoiceFamily, VoiceInfo } from '@/engine';
import { formatBytes, formatQuality, formatVoiceName } from '@/lib/format';
import { ConfirmButton } from '../ConfirmButton/ConfirmButton';
import { Icon } from '../Icon/Icon';
import { LicenseBadge } from '../LicenseBadge/LicenseBadge';
import styles from './VoicePicker.module.css';

/** Nome do modelo compartilhado de cada família (para o aviso de download). */
const FAMILY_LABEL: Record<VoiceFamily, string> = { piper: 'Piper', kokoro: 'Kokoro', supertonic: 'Supertonic' };

export type PreviewStatus = 'idle' | 'loading' | 'playing';

/** Bytes a baixar agora (considera arquivos compartilhados já presentes). */
export function downloadSize(voice: VoiceInfo): number | undefined {
  return voice.downloadBytes || voice.sizeBytes;
}

export interface VoiceRowProps {
  voice: VoiceInfo;
  selected: boolean;
  /** Percentual do download; `undefined` se não está baixando. */
  downloadPct?: number;
  preview: PreviewStatus;
  canPreview: boolean;
  /** Bloqueia remover/baixar (ex.: durante uma narração). */
  disabled: boolean;
  onSelect: (id: string) => void;
  onPreview: (voice: VoiceInfo) => void;
  onDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Linha do seletor: ▶ prévia · dados da voz (clique seleciona) · ação
 * (baixar, progresso, ou remover com confirmação).
 * Memoizada: o progresso/prévia de uma voz não re-renderiza as outras.
 */
export const VoiceRow = memo(function VoiceRow({
  voice,
  selected,
  downloadPct,
  preview,
  canPreview,
  disabled,
  onSelect,
  onPreview,
  onDownload,
  onCancelDownload,
  onRemove,
}: VoiceRowProps) {
  const name = formatVoiceName(voice.name);

  return (
    <li className={`${styles.row} ${selected ? styles.rowSelected : ''}`}>
      <button
        type="button"
        className={`${styles.previewButton} ${preview !== 'idle' ? styles.previewActive : ''}`}
        onClick={() => onPreview(voice)}
        disabled={!canPreview && preview === 'idle'}
        aria-label={preview === 'idle' ? `Ouvir prévia de ${name}` : `Parar prévia de ${name}`}
        title={canPreview ? 'Ouvir prévia' : 'Prévia indisponível — baixe a voz para ouvir'}
      >
        {preview === 'loading' ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : (
          <Icon name={preview === 'playing' ? 'pause' : 'play'} size={14} />
        )}
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={selected}
        className={styles.rowMain}
        onClick={() => onSelect(voice.id)}
        data-voice-option
      >
        <span className={styles.rowName}>
          {name}
          {voice.gender && <span className={styles.gender}>{voice.gender === 'female' ? '♀' : '♂'}</span>}
          {voice.source === 'community' && <span className={styles.badge}>comunidade</span>}
          {voice.family === 'kokoro' && (
            <span className={styles.badgeSlow} title="Modelo Kokoro: ~8× mais lento que as vozes Piper para gerar o áudio">
              Kokoro · mais lenta
            </span>
          )}
          {voice.family === 'supertonic' && (
            <span
              className={styles.badgeSlow}
              title="Supertonic 3: download grande (~380 MB, uma única vez) e projeto arquivado pela Supertone; qualidade e ritmo ajustáveis"
            >
              Supertonic · experimental
            </span>
          )}
        </span>
        <span className={styles.rowMeta}>
          <LicenseBadge license={voice.license} commercial={voice.commercial} licenseNote={voice.licenseNote} />
          <span className={styles.metaText}>
            {voice.family === 'piper' ? ` · qualidade ${formatQuality(voice.quality)}` : ''}
            {voice.attribution ? ` · ${voice.attribution}` : ''}
          </span>
        </span>
      </button>

      <div className={styles.rowAction}>
        {downloadPct !== undefined ? (
          <button
            type="button"
            className={styles.progressPill}
            onClick={() => onCancelDownload(voice.id)}
            aria-label={`Cancelar download de ${name} (${downloadPct}%)`}
            title="Cancelar download"
          >
            <span className={styles.progressPct}>{downloadPct}%</span>
            <Icon name="close" size={12} />
          </button>
        ) : voice.installed ? (
          <>
            <span className={styles.installed} title="Instalada neste aparelho">
              <Icon name="check" size={14} />
            </span>
            <ConfirmButton
              confirmLabel="Remover?"
              ariaLabel={`Remover ${name} do aparelho`}
              onConfirm={() => onRemove(voice.id)}
              disabled={disabled}
            >
              <Icon name="trash" size={15} />
            </ConfirmButton>
          </>
        ) : (
          <button
            type="button"
            className={styles.downloadPill}
            onClick={() => onDownload(voice.id)}
            disabled={disabled}
            aria-label={`Baixar ${name} (${formatBytes(downloadSize(voice))})`}
            title={
              voice.sharedBytes && (voice.downloadBytes ?? 0) > (voice.sizeBytes ?? 0)
                ? `Inclui o modelo ${FAMILY_LABEL[voice.family]}, baixado uma única vez para todas as vozes ${FAMILY_LABEL[voice.family]}`
                : undefined
            }
          >
            <Icon name="download" size={13} />
            {formatBytes(downloadSize(voice))}
          </button>
        )}
      </div>
    </li>
  );
});
