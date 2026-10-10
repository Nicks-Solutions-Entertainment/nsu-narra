import { type CSSProperties, memo } from 'react';
import type { VoiceInfo } from '@/engine';
import type { LanguageOption } from '@/hooks/useVoices';
import { formatBytes, formatCount, voiceOptionLabel } from '@/lib/format';
import { Icon } from '../Icon/Icon';
import { Select } from '../Select/Select';
import styles from './VoiceControls.module.css';

export interface VoiceControlsProps {
  languages: LanguageOption[];
  language: string;
  voices: VoiceInfo[];
  selected: VoiceInfo | null;
  /** Percentual do download da voz selecionada; `undefined` se não está baixando. */
  downloadPct?: number;
  loading: boolean;
  disabled: boolean;
  onLanguageChange: (code: string) => void;
  onVoiceChange: (id: string) => void;
  onDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Barra de seleção do composer: idioma e voz lado a lado (como o seletor de
 * modelo do Ollama) e a ação da voz atual (baixar / progresso / remover).
 * Memoizado: não re-renderiza enquanto o usuário digita.
 */
export const VoiceControls = memo(function VoiceControls({
  languages,
  language,
  voices,
  selected,
  downloadPct,
  loading,
  disabled,
  onLanguageChange,
  onVoiceChange,
  onDownload,
  onCancelDownload,
  onRemove,
}: VoiceControlsProps) {
  if (loading && languages.length === 0) {
    return <span className={styles.loading}>Carregando vozes…</span>;
  }

  const official = voices.filter((v) => v.source === 'official');
  const community = voices.filter((v) => v.source === 'community');

  return (
    <div className={styles.controls}>
      <Select
        label="Idioma"
        value={language}
        onChange={onLanguageChange}
        disabled={disabled}
        className={styles.language}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label} · {formatCount(l.total)}
          </option>
        ))}
      </Select>

      <Select
        label="Voz"
        value={selected?.id ?? ''}
        onChange={onVoiceChange}
        disabled={disabled || voices.length === 0}
        className={styles.voice}
      >
        {!selected && <option value="">Escolha uma voz</option>}
        <VoiceGroup label="Oficiais" voices={official} />
        <VoiceGroup label="Comunidade" voices={community} />
      </Select>

      {selected && (
        <VoiceAction
          voice={selected}
          downloadPct={downloadPct}
          disabled={disabled}
          onDownload={onDownload}
          onCancelDownload={onCancelDownload}
          onRemove={onRemove}
        />
      )}
    </div>
  );
});

function VoiceGroup({ label, voices }: { label: string; voices: VoiceInfo[] }) {
  if (voices.length === 0) return null;
  return (
    <optgroup label={label}>
      {voices.map((v) => (
        <option key={v.id} value={v.id}>
          {voiceOptionLabel(v)}
        </option>
      ))}
    </optgroup>
  );
}

interface VoiceActionProps {
  voice: VoiceInfo;
  downloadPct?: number;
  disabled: boolean;
  onDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
  onRemove: (id: string) => void;
}

/** Ação contextual da voz selecionada. */
function VoiceAction({ voice, downloadPct, disabled, onDownload, onCancelDownload, onRemove }: VoiceActionProps) {
  if (downloadPct !== undefined) {
    return (
      <button
        type="button"
        className={styles.progressChip}
        onClick={() => onCancelDownload(voice.id)}
        title="Cancelar download"
        style={{ '--progress': downloadPct / 100 } as CSSProperties}
      >
        <span className={styles.progressFill} aria-hidden="true" />
        <span className={styles.chipText}>{downloadPct}%</span>
        <Icon name="close" size={14} />
        <span className="visually-hidden">Cancelar download</span>
      </button>
    );
  }

  if (!voice.installed) {
    return (
      <button type="button" className={styles.downloadChip} onClick={() => onDownload(voice.id)} disabled={disabled}>
        <Icon name="download" size={15} />
        Baixar {formatBytes(voice.sizeBytes)}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={() => onRemove(voice.id)}
      disabled={disabled}
      title="Remover esta voz do aparelho"
      aria-label="Remover esta voz do aparelho"
    >
      <Icon name="trash" size={16} />
    </button>
  );
}
