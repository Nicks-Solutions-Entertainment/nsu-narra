import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { EXPORT_FORMATS, type ExportFormat, exportAudio, supportedFormats } from '@/lib/audio-export';
import { formatBytes } from '@/lib/format';
import { Icon } from '../Icon/Icon';
import styles from './DownloadMenu.module.css';

export interface DownloadMenuProps {
  audio: { blob: Blob; sizeBytes: number; sampleRate: number; durationSec: number };
  /** Nome do arquivo para a extensão escolhida. */
  fileName: (extension: string) => string;
}

/** Formatos suportados pelo navegador (verificado uma vez por sessão). */
let supported: Promise<Set<ExportFormat>> | null = null;

/**
 * Botão de download (só o ícone) que abre um menu de formatos: OGG
 * (recomendado), MP3, FLAC e WAV, com o tamanho estimado de cada um.
 * A conversão acontece no clique, no aparelho; o player segue em WAV.
 *
 * Teclado: setas navegam, Enter escolhe, Esc fecha.
 */
export function DownloadMenu({ audio, fileName }: DownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<Set<ExportFormat> | null>(null);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Ao abrir: descobre os formatos suportados e foca o primeiro item.
  useEffect(() => {
    if (!open) return;
    supported ??= supportedFormats();
    let alive = true;
    void supported.then((set) => alive && setAvailable(set));
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      alive = false;
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const choose = async (format: ExportFormat) => {
    setBusy(format);
    setError(null);
    try {
      const blob = await exportAudio(audio.blob, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName(format);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000); // tempo para o navegador iniciar o download
      setOpen(false);
      triggerRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível converter o áudio.');
    } finally {
      setBusy(null);
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Baixar áudio"
        title="Baixar áudio"
        disabled={busy !== null}
      >
        {busy ? <span className={styles.spinner} aria-hidden="true" /> : <Icon name="download" size={16} />}
      </button>

      {open && (
        <div id={menuId} ref={menuRef} className={styles.menu} role="menu" aria-label="Formato do download" onKeyDown={onMenuKeyDown}>
          {EXPORT_FORMATS.map((f) => {
            const unsupported = available !== null && !available.has(f.format);
            return (
              <button
                key={f.format}
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => void choose(f.format)}
                disabled={busy !== null || unsupported}
              >
                <span className={styles.itemTop}>
                  <strong>{f.label}</strong>
                  {f.recommended && <span className={styles.badge}>recomendado</span>}
                  <span className={styles.size}>
                    {busy === f.format ? 'convertendo…' : `~${formatBytes(f.estimate(audio))}`}
                  </span>
                </span>
                <span className={styles.note}>{unsupported ? 'não suportado neste navegador' : f.note}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
