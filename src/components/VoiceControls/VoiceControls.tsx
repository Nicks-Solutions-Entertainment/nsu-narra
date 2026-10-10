import { type CSSProperties, memo } from 'react';
import type { VoiceInfo } from '@/engine';
import type { DownloadMap, LanguageOption } from '@/hooks/useVoices';
import { formatBytes, formatCount } from '@/lib/format';
import { Icon } from '../Icon/Icon';
import { Select } from '../Select/Select';
import { VoicePicker, type VoicePickerPreview } from '../VoicePicker/VoicePicker';
import styles from './VoiceControls.module.css';

export interface VoiceControlsProps {
  languages: LanguageOption[];
  language: string;
  voices: VoiceInfo[];
  installed: VoiceInfo[];
  installedBytes: number;
  selected: VoiceInfo | null;
  downloads: DownloadMap;
  preview: VoicePickerPreview;
  loading: boolean;
  disabled: boolean;
  commercialOnly: boolean;
  onCommercialOnlyChange: (value: boolean) => void;
  onLanguageChange: (code: string) => void;
  onVoiceChange: (id: string) => void;
  onDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
  onRemove: (ids: string | string[]) => void;
}

/**
 * Barra de seleção do composer: idioma (enum nativo) e voz (painel com prévia
 * e gerenciamento) lado a lado, como o seletor de modelo do Ollama. Se a voz
 * escolhida não estiver instalada, mostra o atalho de download ao lado.
 * Memoizado: não re-renderiza enquanto o usuário digita.
 */
export const VoiceControls = memo(function VoiceControls({
  languages,
  language,
  voices,
  installed,
  installedBytes,
  selected,
  downloads,
  preview,
  loading,
  disabled,
  commercialOnly,
  onCommercialOnlyChange,
  onLanguageChange,
  onVoiceChange,
  onDownload,
  onCancelDownload,
  onRemove,
}: VoiceControlsProps) {
  if (loading && languages.length === 0) {
    return <span className={styles.loading}>Carregando vozes…</span>;
  }

  const downloadPct = selected ? downloads[selected.id] : undefined;

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

      <VoicePicker
        language={language}
        voices={voices}
        installed={installed}
        installedBytes={installedBytes}
        selected={selected}
        downloads={downloads}
        preview={preview}
        disabled={disabled}
        commercialOnly={commercialOnly}
        onCommercialOnlyChange={onCommercialOnlyChange}
        onSelect={onVoiceChange}
        onDownload={onDownload}
        onCancelDownload={onCancelDownload}
        onRemove={onRemove}
      />

      {selected && (downloadPct !== undefined || !selected.installed) && (
        <DownloadAction
          voice={selected}
          downloadPct={downloadPct}
          disabled={disabled}
          onDownload={onDownload}
          onCancelDownload={onCancelDownload}
        />
      )}
    </div>
  );
});

interface DownloadActionProps {
  voice: VoiceInfo;
  downloadPct?: number;
  disabled: boolean;
  onDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
}

/** Atalho de download (ou progresso) da voz selecionada. */
function DownloadAction({ voice, downloadPct, disabled, onDownload, onCancelDownload }: DownloadActionProps) {
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

  return (
    <button type="button" className={styles.downloadChip} onClick={() => onDownload(voice.id)} disabled={disabled}>
      <Icon name="download" size={15} />
      Baixar {formatBytes(voice.sizeBytes)}
    </button>
  );
}
