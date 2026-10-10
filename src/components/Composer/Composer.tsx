import { type KeyboardEvent, type ReactNode, useId, useLayoutEffect, useRef } from 'react';
import { formatCount } from '@/lib/format';
import { Icon } from '../Icon/Icon';
import { Toggle } from '../Toggle/Toggle';
import styles from './Composer.module.css';

/** Altura máxima da caixa antes de rolar (px). */
const MAX_HEIGHT = 280;

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  running: boolean;
  /** Motivo pelo qual não é possível enviar; `null` quando pode. */
  blockedReason: string | null;
  enterToSend: boolean;
  onEnterToSendChange: (value: boolean) => void;
  maxLength: number;
  /** Seletores exibidos na barra inferior (idioma, voz…). */
  toolbar: ReactNode;
  /** Conteúdo abaixo da caixa (créditos da voz). */
  footer?: ReactNode;
}

/**
 * Caixa de mensagem fixa no rodapé, no estilo de apps de chat (Ollama):
 * texto que cresce com o conteúdo, seletores embaixo e botão de enviar/parar.
 *
 * Atalhos:
 *  - "Enviar com Enter" ligado: Enter envia, Shift+Enter quebra linha.
 *  - Desligado: Enter quebra linha, Ctrl/⌘+Enter envia.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  running,
  blockedReason,
  enterToSend,
  onEnterToSendChange,
  maxLength,
  toolbar,
  footer,
}: ComposerProps) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = !running && !blockedReason && value.trim().length > 0;

  // Auto-altura: mede o conteúdo só quando o texto muda (um reflow por tecla).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const shortcut = enterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey;
    if (!shortcut) return;
    e.preventDefault();
    if (canSubmit) onSubmit();
  }

  const hint = enterToSend ? 'Enter envia · Shift+Enter quebra linha' : 'Ctrl+Enter envia';

  return (
    <div className={styles.composer}>
      <div className={styles.box}>
        <label htmlFor={id} className="visually-hidden">
          Texto para narrar
        </label>
        <textarea
          id={id}
          ref={textareaRef}
          className={styles.textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          rows={1}
          lang="pt-BR"
          spellCheck
          placeholder="Digite o texto para narrar…"
        />

        <div className={styles.toolbar}>
          <div className={styles.toolbarStart}>{toolbar}</div>
          <div className={styles.toolbarEnd}>
            <Toggle checked={enterToSend} onChange={onEnterToSendChange} label="Enviar com Enter" title={hint} />
            {running ? (
              <button type="button" className={styles.sendButton} onClick={onStop} aria-label="Parar geração" title="Parar">
                <Icon name="stop" size={14} />
              </button>
            ) : (
              <button
                type="button"
                className={styles.sendButton}
                onClick={onSubmit}
                disabled={!canSubmit}
                aria-label="Gerar áudio"
                title={blockedReason ?? `Gerar áudio (${hint})`}
              >
                <Icon name="send" size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={styles.meta}>
        <span className={styles.status} aria-live="polite">
          {blockedReason ?? hint}
        </span>
        <span className={styles.counter}>
          {formatCount(value.length)} / {formatCount(maxLength)}
        </span>
      </div>
      {footer}
    </div>
  );
}
