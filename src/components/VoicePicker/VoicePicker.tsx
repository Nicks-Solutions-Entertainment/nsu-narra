import { memo } from 'react';
import type { VoiceInfo } from '@/engine';
import type { DownloadMap } from '@/hooks/useVoices';
import { VoiceItem } from './VoiceItem';
import styles from './VoicePicker.module.css';

export interface VoicePickerProps {
  voices: VoiceInfo[];
  selectedId: string | null;
  downloads: DownloadMap;
  loading: boolean;
  /** Bloqueia trocas durante a geração. */
  disabled: boolean;
  onSelect: (id: string) => void;
  onDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Lista de vozes pt-BR (componente de apresentação, sem acesso ao motor).
 * Memoizado para não re-renderizar a cada tecla digitada no texto.
 */
export const VoicePicker = memo(function VoicePicker({
  voices,
  selectedId,
  downloads,
  loading,
  disabled,
  ...handlers
}: VoicePickerProps) {
  return (
    <fieldset className={styles.fieldset} aria-busy={loading}>
      <legend className="section-title">1. Voz</legend>

      {loading && voices.length === 0 ? (
        <p className={styles.empty}>Carregando vozes…</p>
      ) : voices.length === 0 ? (
        <p className={styles.empty}>Nenhuma voz pt-BR disponível.</p>
      ) : (
        <ul className={styles.list}>
          {voices.map((voice) => (
            <VoiceItem
              key={voice.id}
              voice={voice}
              selected={voice.id === selectedId}
              downloadPct={downloads[voice.id]}
              disabled={disabled}
              {...handlers}
            />
          ))}
        </ul>
      )}

      {voices.length > 0 && !voices.some((v) => v.installed) && (
        <p className={styles.hint}>Baixe uma voz para começar. O download acontece uma única vez.</p>
      )}
    </fieldset>
  );
});
