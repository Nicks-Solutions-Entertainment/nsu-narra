import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { VoiceInfo } from '@/engine';
import type { DownloadMap } from '@/hooks/useVoices';
import { formatBytes, formatVoiceName } from '@/lib/format';
import { languageLabel } from '@/lib/languages';
import { sessionPhrase } from '@/lib/voice-samples';
import { Icon } from '../Icon/Icon';
import { Toggle } from '../Toggle/Toggle';
import { ManageVoices } from './ManageVoices';
import { type PreviewStatus, VoiceRow } from './VoiceRow';
import styles from './VoicePicker.module.css';

/** Acima disso a lista ganha campo de busca. */
const SEARCH_THRESHOLD = 6;

export interface VoicePickerPreview {
  playingId: string | null;
  loadingId: string | null;
  error: string | null;
  toggle: (voice: VoiceInfo) => void;
  stop: () => void;
  canPreview: (voice: VoiceInfo) => boolean;
}

export interface VoicePickerProps {
  language: string;
  /** Vozes do idioma selecionado. */
  voices: VoiceInfo[];
  /** Vozes instaladas (todos os idiomas), para "Gerenciar". */
  installed: VoiceInfo[];
  installedBytes: number;
  selected: VoiceInfo | null;
  downloads: DownloadMap;
  preview: VoicePickerPreview;
  disabled: boolean;
  /** Mostrar só vozes cuja licença permite uso comercial. */
  commercialOnly: boolean;
  onCommercialOnlyChange: (value: boolean) => void;
  onSelect: (id: string) => void;
  onDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
  onRemove: (ids: string | string[]) => void;
}

/**
 * Seletor de voz em painel (como o seletor de modelo do Ollama), aberto
 * acima do composer. Cada voz tem prévia, estado de instalação e ações.
 * Abaixo da lista, "Gerenciar" mostra o que ocupa espaço no aparelho.
 *
 * Teclado: setas navegam entre as vozes, Enter/Espaço seleciona, Esc fecha.
 * No celular o painel vira uma folha inferior (CSS).
 */
export function VoicePicker(props: VoicePickerProps) {
  const { selected, disabled, preview } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = () => {
    setOpen(false);
    preview.stop();
  };

  // Fecha ao clicar fora (o listener só existe com o painel aberto).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        preview.stop();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, preview]);

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        disabled={disabled}
      >
        <Icon name="wave" size={15} />
        <span className={styles.triggerLabel}>{selected ? formatVoiceName(selected.name) : 'Escolher voz'}</span>
        {selected && !selected.installed && <span className={styles.triggerDot} title="Não instalada" />}
        <Icon name="chevron" size={14} className={styles.triggerChevron} />
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={close} aria-hidden="true" />
          <Panel
            {...props}
            id={panelId}
            onClose={() => {
              close();
              triggerRef.current?.focus();
            }}
          />
        </>
      )}
    </div>
  );
}

type PanelProps = VoicePickerProps & { id: string; onClose: () => void };

/** Conteúdo do painel; montado só quando aberto (nada custa com ele fechado). */
function Panel({
  id,
  language,
  voices,
  installed,
  installedBytes,
  selected,
  downloads,
  preview,
  disabled,
  commercialOnly,
  onCommercialOnlyChange,
  onSelect,
  onDownload,
  onCancelDownload,
  onRemove,
  onClose,
}: PanelProps) {
  const [view, setView] = useState<'voices' | 'manage'>('voices');
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const phrase = sessionPhrase(language);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return voices.filter(
      (v) =>
        (!commercialOnly || v.commercial === 'yes') &&
        (!q || normalize(`${v.name} ${v.attribution ?? ''} ${v.license}`).includes(q)),
    );
  }, [voices, query, commercialOnly]);
  const hiddenByLicense = commercialOnly ? voices.filter((v) => v.commercial !== 'yes').length : 0;
  const official = filtered.filter((v) => v.family === 'piper' && v.source === 'official');
  const community = filtered.filter((v) => v.family === 'piper' && v.source === 'community');
  const kokoro = filtered.filter((v) => v.family === 'kokoro');

  // Foco inicial: busca (se houver) ou a voz selecionada.
  useEffect(() => {
    if (searchRef.current) return searchRef.current.focus();
    listRef.current?.querySelector<HTMLElement>('[aria-checked="true"], [data-voice-option]')?.focus();
  }, []);

  const handleSelect = (voiceId: string) => {
    onSelect(voiceId);
    onClose();
  };

  /** Setas movem o foco entre as opções; Esc fecha. */
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const options = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-voice-option]') ?? [])];
    if (options.length === 0) return;
    e.preventDefault();
    const current = options.indexOf(document.activeElement as HTMLElement);
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const next = current === -1 ? (delta > 0 ? 0 : options.length - 1) : (current + delta + options.length) % options.length;
    options[next].focus();
  }

  const rowProps = (v: VoiceInfo) => ({
    voice: v,
    selected: v.id === selected?.id,
    downloadPct: downloads[v.id],
    preview: (preview.loadingId === v.id ? 'loading' : preview.playingId === v.id ? 'playing' : 'idle') as PreviewStatus,
    canPreview: preview.canPreview(v),
    disabled,
    onSelect: handleSelect,
    onPreview: preview.toggle,
    onDownload,
    onCancelDownload,
    onRemove,
  });

  return (
    <div id={id} className={styles.panel} role="dialog" aria-label="Escolher voz" onKeyDown={handleKeyDown}>
      <div className={styles.panelHeader}>
        <div className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={view === 'voices'} onClick={() => setView('voices')}>
            {languageLabel(language)}
          </button>
          <button type="button" role="tab" aria-selected={view === 'manage'} onClick={() => setView('manage')}>
            <Icon name="storage" size={14} />
            No aparelho · {installed.length}
          </button>
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar">
          <Icon name="close" size={16} />
        </button>
      </div>

      {view === 'voices' ? (
        <>
          {voices.length > SEARCH_THRESHOLD && (
            <label className={styles.search}>
              <Icon name="search" size={15} />
              <span className="visually-hidden">Buscar voz</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar voz…"
              />
            </label>
          )}

          <div className={styles.filters}>
            <Toggle
              checked={commercialOnly}
              onChange={onCommercialOnlyChange}
              label="Somente uso comercial"
              title="Mostra apenas vozes cuja licença permite uso comercial sem ressalvas"
            />
            {hiddenByLicense > 0 && <span className={styles.filterHint}>{hiddenByLicense} ocultas</span>}
          </div>

          {phrase && (
            <p className={styles.phrase}>
              <Icon name="play" size={11} /> Prévia: “{phrase.text}” <span>— {phrase.source}</span>
            </p>
          )}

          <div className={styles.scroll}>
            <ul ref={listRef} className={styles.list} role="radiogroup" aria-label="Vozes">
              <Group label="Oficiais" voices={official} rowProps={rowProps} />
              <Group label="Comunidade" voices={community} rowProps={rowProps} />
              <Group label="Kokoro · mais lentas" voices={kokoro} rowProps={rowProps} />
            </ul>
            {filtered.length === 0 && (
              <p className={styles.empty}>
                {commercialOnly && !query
                  ? 'Nenhuma voz deste idioma tem licença que permita uso comercial sem ressalvas. Desative o filtro e passe o mouse sobre o ⚖ de cada voz para ver o motivo.'
                  : 'Nenhuma voz encontrada.'}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className={styles.scroll}>
          <ManageVoices installed={installed} installedBytes={installedBytes} disabled={disabled} onRemove={onRemove} />
        </div>
      )}

      <div className={styles.panelFooter}>
        {preview.error ? (
          <span className={styles.footerError}>{preview.error}</span>
        ) : (
          <span>
            {installed.length} {installed.length === 1 ? 'voz' : 'vozes'} · {formatBytes(installedBytes) || '0 MB'} neste aparelho
          </span>
        )}
      </div>
    </div>
  );
}

function Group({
  label,
  voices,
  rowProps,
}: {
  label: string;
  voices: VoiceInfo[];
  rowProps: (v: VoiceInfo) => Parameters<typeof VoiceRow>[0];
}) {
  if (voices.length === 0) return null;
  return (
    <>
      <li className={styles.groupLabel} role="presentation">
        {label}
      </li>
      {voices.map((v) => (
        <VoiceRow key={v.id} {...rowProps(v)} />
      ))}
    </>
  );
}

/** Minúsculas e sem acentos, para a busca. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
