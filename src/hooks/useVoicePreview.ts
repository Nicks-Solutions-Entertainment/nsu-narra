'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TtsEngine, VoiceInfo } from '@/engine';
import { formatVoiceName } from '@/lib/format';
import { canPlayOgg, hasLocalSample, localSampleUrl, sessionPhrase } from '@/lib/voice-samples';
import { errorMessage } from './useEngine';

export interface VoicePreviewState {
  /** Voz tocando agora. */
  playingId: string | null;
  /** Voz cujo preview está sendo preparado (gerado ou carregado). */
  loadingId: string | null;
  error: string | null;
  toggle: (voice: VoiceInfo) => void;
  stop: () => void;
  /** A voz tem alguma fonte de preview disponível agora? */
  canPreview: (voice: VoiceInfo) => boolean;
}

/**
 * Preview das vozes, com um único player compartilhado (só um toca por vez).
 *
 * Fontes, em ordem de preferência:
 *  1. OGG pré-gravado do projeto, com a frase sorteada no carregamento da página;
 *  2. amostra remota publicada pelo Piper (vozes oficiais, sem baixar o modelo);
 *  3. síntese local de uma frase curta, se a voz estiver instalada.
 *
 * Desempenho: a síntese local é feita uma vez por voz e guardada como object
 * URL (revogados ao desmontar). Ela fica bloqueada enquanto há narração em
 * andamento, para o worker não trocar de modelo no meio da geração.
 */
export function useVoicePreview(engine: TtsEngine | null, busy: boolean): VoicePreviewState {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthCache = useRef(new Map<string, string>());
  const requestRef = useRef(0);

  useEffect(() => {
    const cache = synthCache.current;
    return () => {
      audioRef.current?.pause();
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, []);

  const stop = useCallback(() => {
    requestRef.current++;
    audioRef.current?.pause();
    setPlayingId(null);
    setLoadingId(null);
  }, []);

  const canPreview = useCallback(
    (voice: VoiceInfo) =>
      (hasLocalSample(voice.id, voice.language) && canPlayOgg()) ||
      !!voice.sampleUrl ||
      (voice.installed && !!engine && !busy) ||
      synthCache.current.has(voice.id),
    [engine, busy],
  );

  const resolveSource = useCallback(
    async (voice: VoiceInfo): Promise<string> => {
      const local = canPlayOgg() ? localSampleUrl(voice.id, voice.language) : null;
      if (local) return local;
      if (voice.sampleUrl) return voice.sampleUrl;

      const cached = synthCache.current.get(voice.id);
      if (cached) return cached;
      if (!engine || !voice.installed) throw new Error('Esta voz não tem prévia disponível.');

      const phrase = sessionPhrase(voice.language)?.text ?? `Olá! Eu sou a voz ${formatVoiceName(voice.name)}.`;
      const url = URL.createObjectURL(await engine.synthesize(phrase, voice.id));
      synthCache.current.set(voice.id, url);
      return url;
    },
    [engine],
  );

  const toggle = useCallback(
    (voice: VoiceInfo) => {
      if (playingId === voice.id || loadingId === voice.id) return stop();
      stop();
      const request = requestRef.current;
      setError(null);
      setLoadingId(voice.id);

      const audio = (audioRef.current ??= createAudio());
      audio.onended = () => setPlayingId((id) => (id === voice.id ? null : id));

      resolveSource(voice)
        .then(async (src) => {
          if (request !== requestRef.current) return; // outra prévia foi pedida
          audio.src = src;
          await audio.play();
          if (request === requestRef.current) setPlayingId(voice.id);
        })
        .catch((err) => {
          if (request === requestRef.current) setError(errorMessage(err));
        })
        .finally(() => {
          if (request === requestRef.current) setLoadingId(null);
        });
    },
    [playingId, loadingId, resolveSource, stop],
  );

  return useMemo(
    () => ({ playingId, loadingId, error, toggle, stop, canPreview }),
    [playingId, loadingId, error, toggle, stop, canPreview],
  );
}

/**
 * `crossOrigin` é necessário para tocar amostras de outro domínio com o
 * isolamento (COEP) ativado pelo coi-serviceworker.
 */
function createAudio(): HTMLAudioElement {
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  return audio;
}
