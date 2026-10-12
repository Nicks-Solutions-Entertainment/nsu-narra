import { memo, useId } from 'react';
import type { Narration, NarrationVersion, Tuning } from '@/hooks/useNarrations';
import { audioFileName, formatTime } from '@/lib/format';
import { AudioPlayer } from '../AudioPlayer/AudioPlayer';
import { DownloadMenu } from '../DownloadMenu/DownloadMenu';
import { Icon } from '../Icon/Icon';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import styles from './NarrationList.module.css';

interface NarrationItemProps {
  item: Narration;
  onRemove: (id: string) => void;
  onRegenerate: (id: string) => void;
  onSelectVersion: (id: string, index: number) => void;
  canRegenerate: boolean;
}

const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Ajustes usados numa versão, em linhas "rótulo: valor". */
function tuningRows({ speed = 1, steps, variation }: Tuning): [string, string][] {
  return [
    ['Velocidade', `${decimal.format(speed)}×`],
    ['Variação de ritmo', variation ? `±${Math.round(variation * 100)}%` : 'desligada'],
    ['Qualidade', steps !== undefined ? `${steps} passos` : 'padrão do modelo'],
  ];
}

/**
 * Um par do chat: o texto enviado (à direita) e o áudio gerado (à esquerda).
 * "Regerar" acrescenta versões ao mesmo item, navegáveis por "< 1 / 2 >".
 * Memoizado: o progresso de um item não re-renderiza os outros.
 */
export const NarrationItem = memo(function NarrationItem({
  item,
  onRemove,
  onRegenerate,
  onSelectVersion,
  canRegenerate,
}: NarrationItemProps) {
  const version = item.versions[item.active];
  const total = item.versions.length;
  const busy = item.versions.some((v) => v.status === 'running');

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
            <TuningInfo tuning={version.tuning} />
            <span className={styles.time}>{formatTime(version.createdAt)}</span>

            <div className={styles.actions}>
              {total > 1 && (
                <div className={styles.versions} role="group" aria-label="Versões do áudio">
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => onSelectVersion(item.id, item.active - 1)}
                    disabled={item.active === 0}
                    aria-label="Versão anterior"
                  >
                    <Icon name="chevronLeft" size={14} />
                  </button>
                  <span className={styles.versionCount} aria-live="polite">
                    {item.active + 1} / {total}
                  </span>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => onSelectVersion(item.id, item.active + 1)}
                    disabled={item.active === total - 1}
                    aria-label="Próxima versão"
                  >
                    <Icon name="chevronRight" size={14} />
                  </button>
                </div>
              )}
              {!busy && (
                <>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => onRegenerate(item.id)}
                    disabled={!canRegenerate}
                    aria-label="Regerar com as mesmas configurações"
                    title="Regerar com as mesmas configurações"
                  >
                    <Icon name="refresh" size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => onRemove(item.id)}
                    aria-label="Remover esta narração"
                    title="Remover"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          <ReplyContent version={version} fileName={(ext) => audioFileName(item.voiceId, new Date(version.createdAt), ext)} />
        </div>
      </div>
    </li>
  );
});

/** Ícone de configurações; no hover (ou foco) mostra os ajustes da versão. */
function TuningInfo({ tuning }: { tuning: Tuning }) {
  const tipId = useId();
  return (
    <span className={styles.tuning}>
      <button type="button" className={styles.tuningButton} aria-describedby={tipId} aria-label="Configurações da voz">
        <Icon name="sliders" size={13} />
      </button>
      <span id={tipId} role="tooltip" className={styles.tooltip}>
        {tuningRows(tuning).map(([label, value]) => (
          <span key={label} className={styles.tooltipRow}>
            <span>{label}</span>
            <strong>{value}</strong>
          </span>
        ))}
      </span>
    </span>
  );
}

function ReplyContent({ version, fileName }: { version: NarrationVersion; fileName: (extension: string) => string }) {
  switch (version.status) {
    case 'running': {
      const p = version.progress;
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
      return <p className={styles.error}>{version.error}</p>;
    case 'cancelled':
      return <p className={styles.statusText}>Geração cancelada.</p>;
    case 'done':
      return version.audio ? (
        <div className={styles.player}>
          {/* `key`: ao trocar de versão o player recomeça do início. */}
          <AudioPlayer
            key={version.id}
            src={version.audio.url}
            wav={version.audio.blob}
            durationSec={version.audio.durationSec}
          />
          <DownloadMenu audio={version.audio} fileName={fileName} />
        </div>
      ) : null;
  }
}
