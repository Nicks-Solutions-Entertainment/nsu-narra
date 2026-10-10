'use client';

import { useCallback, useMemo } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { AudioPlayer } from '@/components/AudioPlayer/AudioPlayer';
import { GenerateControls } from '@/components/GenerateControls/GenerateControls';
import { TextInput } from '@/components/TextInput/TextInput';
import { VoicePicker } from '@/components/VoicePicker/VoicePicker';
import { useDraft } from '@/hooks/useDraft';
import { useEngine } from '@/hooks/useEngine';
import { useSynthesis } from '@/hooks/useSynthesis';
import { useVoices } from '@/hooks/useVoices';
import styles from './NarratorScreen.module.css';

/** Limite de caracteres por geração (protege a memória em celulares). */
const MAX_TEXT_LENGTH = 20_000;

/**
 * Tela principal (container): liga os hooks de estado aos componentes de
 * apresentação. É o único lugar da UI que conhece o motor.
 *
 * Fluxo: escolher voz → digitar texto → gerar → ouvir/baixar.
 */
export function NarratorScreen() {
  const { engine, error: engineError } = useEngine();
  const voices = useVoices(engine);
  const synthesis = useSynthesis(engine);
  const [text, setText] = useDraft();

  const running = synthesis.status === 'running';
  const selectedVoice = useMemo(
    () => voices.voices.find((v) => v.id === voices.selectedId) ?? null,
    [voices.voices, voices.selectedId],
  );

  const blockedReason = !engine
    ? 'Carregando o motor de voz…'
    : !selectedVoice?.installed
      ? 'Baixe e selecione uma voz.'
      : !text.trim()
        ? 'Digite algum texto.'
        : null;

  const { generate } = synthesis;
  const handleGenerate = useCallback(() => {
    if (selectedVoice) void generate(text, selectedVoice.id);
  }, [generate, text, selectedVoice]);

  const { download, remove } = voices;
  const handleDownload = useCallback((id: string) => void download(id), [download]);
  const handleRemove = useCallback((id: string) => void remove(id), [remove]);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Narra</h1>
        <p className={styles.subtitle}>
          Transforme texto em narração em português. Tudo roda no seu aparelho — nada é enviado para servidores.
        </p>
      </header>

      {engineError && <Alert>Não foi possível iniciar o motor de voz: {engineError}</Alert>}
      {voices.error && (
        <Alert
          action={
            <button type="button" className="btn btn-ghost" onClick={voices.reload}>
              Tentar de novo
            </button>
          }
        >
          {voices.error}
        </Alert>
      )}

      <section className={styles.card}>
        <VoicePicker
          voices={voices.voices}
          selectedId={voices.selectedId}
          downloads={voices.downloads}
          loading={voices.loading}
          disabled={running}
          onSelect={voices.select}
          onDownload={handleDownload}
          onCancelDownload={voices.cancelDownload}
          onRemove={handleRemove}
        />
      </section>

      <section className={styles.card}>
        <TextInput value={text} onChange={setText} disabled={running} maxLength={MAX_TEXT_LENGTH} />
        <GenerateControls
          running={running}
          progress={synthesis.progress}
          blockedReason={blockedReason}
          onGenerate={handleGenerate}
          onCancel={synthesis.cancel}
        />
        {synthesis.error && <Alert>{synthesis.error}</Alert>}
      </section>

      {synthesis.audio && (
        <AudioPlayer
          src={synthesis.audio.url}
          voiceId={synthesis.audio.voiceId}
          sizeBytes={synthesis.audio.sizeBytes}
        />
      )}

      <footer className={styles.footer}>
        Vozes{' '}
        <a href="https://huggingface.co/rhasspy/piper-voices" target="_blank" rel="noreferrer">
          Piper
        </a>
        . Confira a licença de cada voz antes de uso comercial.
        {engine && <span className={styles.engine}> · motor: {engine.kind}</span>}
      </footer>
    </main>
  );
}
