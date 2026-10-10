import { memo } from 'react';
import { audioFileName, formatBytes } from '@/lib/format';
import styles from './AudioPlayer.module.css';

interface AudioPlayerProps {
  /** Object URL do WAV gerado. */
  src: string;
  voiceId: string;
  sizeBytes: number;
}

/** Player do áudio gerado com botão para baixar o `.wav`. */
export const AudioPlayer = memo(function AudioPlayer({ src, voiceId, sizeBytes }: AudioPlayerProps) {
  return (
    <section className={styles.wrapper} aria-label="Áudio gerado">
      <h2 className="section-title">3. Resultado</h2>
      <audio className={styles.audio} controls src={src} preload="metadata" />
      <div className={styles.row}>
        <a className="btn btn-primary" href={src} download={audioFileName(voiceId)}>
          Baixar .wav
        </a>
        <span className={styles.size}>{formatBytes(sizeBytes)}</span>
      </div>
    </section>
  );
});
