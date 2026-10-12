import { memo, useEffect, useId, useRef, useState } from 'react';
import {
  DEFAULT_SPEED,
  DEFAULT_STEPS,
  DEFAULT_VARIATION,
  SPEED_RANGE,
  STEPS_RANGE,
  type TuningRange,
  VARIATION_RANGE,
  type VoiceInfo,
} from '@/engine';
import { Icon } from '../Icon/Icon';
import styles from './VoiceSettings.module.css';

const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface VoiceSettingsProps {
  voice: VoiceInfo | null;
  speed: number;
  steps: number;
  /** Variação máxima da velocidade entre frases (0–0,1), com média na velocidade escolhida. */
  variation: number;
  disabled: boolean;
  onSpeedChange: (value: number) => void;
  onStepsChange: (value: number) => void;
  onVariationChange: (value: number) => void;
}

/**
 * Botão de configuração da voz (ao lado do seletor), como os controles do
 * exemplo do Supertonic: velocidade para todas as vozes e passos de qualidade
 * só para vozes Supertonic. A velocidade é a base da variação de ritmo.
 * No celular o painel vira uma folha inferior (CSS).
 */
export const VoiceSettings = memo(function VoiceSettings(props: VoiceSettingsProps) {
  const { disabled } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const customized =
    props.speed !== DEFAULT_SPEED ||
    props.variation !== DEFAULT_VARIATION ||
    (props.voice?.family === 'supertonic' && props.steps !== DEFAULT_STEPS);

  // Fecha ao clicar fora ou com Esc (os listeners só existem com o painel aberto).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label="Configurar voz"
        title="Configurar voz (velocidade e qualidade)"
        disabled={disabled}
      >
        <Icon name="sliders" size={16} />
        {customized && <span className={styles.dot} aria-hidden="true" />}
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />
          <Panel {...props} id={panelId} onClose={() => setOpen(false)} />
        </>
      )}
    </div>
  );
});

type PanelProps = VoiceSettingsProps & { id: string; onClose: () => void };

function Panel({
  id,
  voice,
  speed,
  steps,
  variation,
  onSpeedChange,
  onStepsChange,
  onVariationChange,
  onClose,
}: PanelProps) {
  const supertonic = voice?.family === 'supertonic';

  const reset = () => {
    onSpeedChange(DEFAULT_SPEED);
    onStepsChange(DEFAULT_STEPS);
    onVariationChange(DEFAULT_VARIATION);
  };

  return (
    <div id={id} className={styles.panel} role="dialog" aria-label="Configuração da voz">
      <div className={styles.header}>
        <strong>Configuração da voz</strong>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
          <Icon name="close" size={16} />
        </button>
      </div>

      <Slider
        label="Velocidade"
        value={speed}
        range={SPEED_RANGE}
        format={(v) => `${decimal.format(v)}×`}
        hint="Base do ritmo da fala, para todas as vozes."
        onChange={onSpeedChange}
      />

      <Slider
        label="Variação de ritmo"
        value={variation}
        range={VARIATION_RANGE}
        format={(v) => (v === 0 ? 'desligada' : `±${Math.round(v * 100)}%`)}
        hint="Quanto cada frase pode variar em torno da velocidade; a média continua nela. Valores baixos soam mais discretos."
        onChange={onVariationChange}
      />

      {supertonic ? (
        <Slider
          label="Qualidade (passos)"
          value={steps}
          range={STEPS_RANGE}
          format={(v) => String(v)}
          hint="Mais passos, mais qualidade e mais tempo para gerar. Recomendado: 5 a 12."
          onChange={onStepsChange}
        />
      ) : (
        <p className={styles.hint}>A qualidade em passos só existe nas vozes Supertonic.</p>
      )}

      <div className={styles.footer}>
        <button type="button" className="btn btn-ghost" onClick={reset}>
          Restaurar padrão
        </button>
      </div>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  range: TuningRange;
  format: (value: number) => string;
  hint: string;
  onChange: (value: number) => void;
}

function Slider({ label, value, range, format, hint, onChange }: SliderProps) {
  const inputId = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        <span>{label}</span>
        <output htmlFor={inputId} className={styles.value}>
          {format(value)}
        </output>
      </label>
      <input
        id={inputId}
        type="range"
        className={styles.range}
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        // Arredonda para o passo: evita 0,7500000001 vindo do input.
        onChange={(e) => onChange(Number((Math.round(Number(e.target.value) / range.step) * range.step).toFixed(2)))}
      />
      <p className={styles.hint}>{hint}</p>
    </div>
  );
}
