import { memo } from 'react';
import type { Narration } from '@/hooks/useNarrations';
import { audioFileName, formatBytes, formatTime } from '@/lib/format';
import { Icon } from '../Icon/Icon';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import styles from './NarrationList.module.css';

interface NarrationItemProps {
  item: Narration;
  onRemove: (id: string) => void;
}

/**
 * Um par do chat: o texto enviado (à direita) e o áudio gerado (à esquerda).
 * Memoizado: o progresso de um item não re-renderiza os outros.
 */
export const NarrationItem = memo(function NarrationItem({ item, onRemove }: NarrationItemProps) {
  return (
    <li className={styles.item}>
      <div className={styles.userRow}>
        <p className={styles.userBubble}>{item.text}</p>
      </div>

      <div className={styles.reply}>
        <div className={styles.avatar} aria-hidden="true">
          <Icon name="wave" size={16} />
        </div>

        <div className={styles.replyBody}>
          <div className={styles.replyHeader}>
            <span className={styles.voice}>{item.voiceLabel}</span>
            <span className={styles.time}>{formatTime(item.createdAt)}</span>
            {item.status !== 'running' && (
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => onRemove(item.id)}
                aria-label="Remover esta narração"
                title="Remover"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <ReplyContent item={item} />
        </div>
      </div>
    </li>
  );
});

function ReplyContent({ item }: { item: Narration }) {
  switch (item.status) {
    case 'running': {
      const p = item.progress;
      const pct = p && p.total > 0 && p.done > 0 ? Math.round((p.done / p.total) * 100) : null;
      const label = !p || p.done === 0 ? 'Preparando a voz…' : `Gerando trecho ${Math.min(p.done + 1, p.total)} de ${p.total}…`;
      return (
        <div className={styles.running}>
          <span className={styles.statusText}>{label}</span>
          <ProgressBar value={pct} label="Progresso da geração" />
        </div>
      );
    }
    case 'error':
      return <p className={styles.error}>{item.error}</p>;
    case 'cancelled':
      return <p className={styles.statusText}>Geração cancelada.</p>;
    case 'done':
      return item.audio ? (
        <div className={styles.player}>
          <audio className={styles.audio} controls src={item.audio.url} preload="metadata" />
          <a className={styles.downloadLink} href={item.audio.url} download={audioFileName(item.voiceId, new Date(item.createdAt))}>
            <Icon name="download" size={15} />
            Baixar .wav <span className={styles.size}>{formatBytes(item.audio.sizeBytes)}</span>
          </a>
        </div>
      ) : null;
  }
}
