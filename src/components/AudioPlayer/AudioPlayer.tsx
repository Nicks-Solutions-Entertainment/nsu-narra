import { type CSSProperties, type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { waveformPeaks } from '@/lib/audio-export/waveform';
import { Icon } from '../Icon/Icon';
import styles from './AudioPlayer.module.css';

/** Barras da forma de onda (encolhem com a largura; o desenho se mantém). */
const BARS = 72;
/** Altura mínima de uma barra, para silêncios continuarem visíveis. */
const MIN_BAR = 0.08;
/** Passo do teclado (setas) em segundos. */
const SEEK_STEP = 5;

/** Player que está tocando: iniciar outro pausa este (um áudio por vez). */
let playing: HTMLAudioElement | null = null;

export interface AudioPlayerProps {
  src: string;
  /** WAV de origem, para desenhar a forma de onda. */
  wav: Blob;
  durationSec: number;
}

/**
 * Player com forma de onda (como o ícone do app e o SoundCloud): barras
 * arredondadas centradas, a parte já tocada em destaque e, no hover, uma
 * prévia do ponto de destino. Clique ou arraste para avançar; no teclado,
 * setas (±5 s), Home e End.
 *
 * Desempenho: o progresso anda por `requestAnimationFrame` escrevendo só uma
 * variável CSS e o texto do tempo (sem re-render do React); a forma de onda
 * é calculada uma vez por áudio.
 */
export function AudioPlayer({ src, wav, durationSec }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0); // só para o aria-valuenow (atualiza no fim do arraste/pausa)

  useEffect(() => {
    let alive = true;
    waveformPeaks(wav, BARS)
      .then((p) => alive && setPeaks(p))
      .catch(() => alive && setPeaks(new Float32Array(BARS).fill(0.3)));
    return () => {
      alive = false;
    };
  }, [wav]);

  /** Desenha o progresso atual (variável CSS + texto do tempo). */
  const paint = (time: number) => {
    const ratio = durationSec > 0 ? Math.min(1, time / durationSec) : 0;
    waveRef.current?.style.setProperty('--played', String(ratio));
    if (timeRef.current) timeRef.current.textContent = `${formatClock(time)} / ${formatClock(durationSec)}`;
  };

  // Enquanto toca, atualiza a cada quadro.
  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const tick = () => {
      paint(audioRef.current?.currentTime ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `paint` só lê refs e a duração
  }, [isPlaying, durationSec]);

  // Pausa ao desmontar (ex.: trocar de versão ou remover a narração).
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
      if (playing === audio) playing = null;
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) return audio.pause();
    if (playing && playing !== audio) playing.pause();
    playing = audio;
    void audio.play();
  };

  const seek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = Math.max(0, Math.min(durationSec, time));
    audio.currentTime = t;
    paint(t);
    setPosition(t);
  };

  const ratioAt = (clientX: number) => {
    const rect = waveRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seek(ratioAt(e.clientX) * durationSec);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const ratio = ratioAt(e.clientX);
    e.currentTarget.style.setProperty('--hover', String(ratio));
    if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(ratio * durationSec);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const now = audioRef.current?.currentTime ?? 0;
    const target =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? now + SEEK_STEP
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? now - SEEK_STEP
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? durationSec
              : null;
    if (target === null) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggle();
      }
      return;
    }
    e.preventDefault();
    seek(target);
  };

  return (
    <div className={styles.player}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          setIsPlaying(false);
          setPosition(audioRef.current?.currentTime ?? 0);
        }}
        onEnded={() => {
          if (playing === audioRef.current) playing = null;
          paint(durationSec);
        }}
      />

      <button
        type="button"
        className={styles.play}
        onClick={toggle}
        aria-label={isPlaying ? 'Pausar' : 'Tocar'}
        title={isPlaying ? 'Pausar' : 'Tocar'}
      >
        <Icon name={isPlaying ? 'pause' : 'play'} size={14} />
      </button>

      <div
        ref={waveRef}
        className={styles.wave}
        role="slider"
        tabIndex={0}
        aria-label="Posição do áudio"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationSec)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${formatClock(position)} de ${formatClock(durationSec)}`}
        style={{ '--played': 0, '--hover': 0 } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        onKeyDown={onKeyDown}
      >
        {/* Três camadas iguais: base, prévia do hover e parte tocada (recortadas por CSS). */}
        {(['base', 'hover', 'played'] as const).map((layer) => (
          <div key={layer} className={`${styles.bars} ${styles[layer]}`} aria-hidden="true">
            {Array.from({ length: BARS }, (_, i) => (
              <span key={i} className={styles.bar} style={{ height: `${barHeight(peaks, i) * 100}%` }} />
            ))}
          </div>
        ))}
      </div>

      <span ref={timeRef} className={styles.time}>
        {formatClock(0)} / {formatClock(durationSec)}
      </span>
    </div>
  );
}

function barHeight(peaks: Float32Array | null, i: number): number {
  // Enquanto calcula: barras baixas e uniformes (sem "pular" depois).
  return peaks ? MIN_BAR + (1 - MIN_BAR) * peaks[i] : MIN_BAR;
}

/** Segundos → "m:ss" (ou "h:mm:ss"). */
function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
