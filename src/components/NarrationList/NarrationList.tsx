import { useEffect, useRef } from 'react';
import type { Narration } from '@/hooks/useNarrations';
import { Icon } from '../Icon/Icon';
import { NarrationItem } from './NarrationItem';
import styles from './NarrationList.module.css';

interface NarrationListProps {
  items: Narration[];
  onRemove: (id: string) => void;
  onRegenerate: (id: string) => void;
  onSelectVersion: (id: string, index: number) => void;
  /** Uma geração em andamento bloqueia o "regerar" (uma por vez). */
  running: boolean;
  onClear: () => void;
}

/**
 * Histórico de narrações (área rolável acima do composer).
 * Rola até o fim quando um item novo é adicionado, como num chat.
 */
export function NarrationList({ items, onRemove, onRegenerate, onSelectVersion, running, onClear }: NarrationListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = items.length;

  useEffect(() => {
    if (count > 0) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [count]);

  if (count === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <Icon name="wave" size={28} />
        </div>
        <h1 className={styles.emptyTitle}>O que vamos narrar hoje?</h1>
        <p className={styles.emptyText}>
          Escolha o idioma e a voz, digite o texto e envie. Tudo é gerado no seu aparelho — nada vai para servidores.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.thread}>
      <div className={styles.threadHeader}>
        <button type="button" className={styles.clearButton} onClick={onClear}>
          Limpar histórico
        </button>
      </div>
      <ol className={styles.list} aria-label="Narrações geradas">
        {items.map((item) => (
          <NarrationItem
            key={item.id}
            item={item}
            onRemove={onRemove}
            onRegenerate={onRegenerate}
            onSelectVersion={onSelectVersion}
            canRegenerate={!running}
          />
        ))}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
