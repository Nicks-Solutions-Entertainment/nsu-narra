'use client';

import { useCallback } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { Composer } from '@/components/Composer/Composer';
import { NarrationList } from '@/components/NarrationList/NarrationList';
import { VoiceControls } from '@/components/VoiceControls/VoiceControls';
import { VoiceNotice } from '@/components/VoiceControls/VoiceNotice';
import { useDraft } from '@/hooks/useDraft';
import { useEngine } from '@/hooks/useEngine';
import { useNarrations } from '@/hooks/useNarrations';
import { useBooleanPreference } from '@/hooks/usePreference';
import { useVoices } from '@/hooks/useVoices';
import { formatVoiceName } from '@/lib/format';
import { languageLabel } from '@/lib/languages';
import { PREF_KEYS } from '@/lib/storage';
import styles from './NarratorScreen.module.css';

/** Limite de caracteres por geração (protege a memória em celulares). */
const MAX_TEXT_LENGTH = 20_000;

/**
 * Tela principal (container), no formato de chat:
 *  - topo: marca e motor em uso;
 *  - meio (rolável): histórico de narrações — cada envio vira um item novo e
 *    os anteriores continuam disponíveis;
 *  - rodapé fixo: composer com idioma, voz e "enviar com Enter".
 *
 * É o único lugar da UI que conhece o motor; os componentes só recebem props.
 */
export function NarratorScreen() {
  const { engine, error: engineError } = useEngine();
  const voices = useVoices(engine);
  const narrations = useNarrations(engine);
  const [text, setText] = useDraft();
  const [enterToSend, setEnterToSend] = useBooleanPreference(PREF_KEYS.enterToSend, true);

  const { selected, downloads } = voices;
  const downloadPct = selected ? downloads[selected.id] : undefined;

  const blockedReason = !engine
    ? 'Carregando o motor de voz…'
    : !selected
      ? 'Escolha uma voz.'
      : downloadPct !== undefined
        ? 'Aguarde o download da voz terminar.'
        : !selected.installed
          ? 'Baixe a voz selecionada para gerar o áudio.'
          : null;

  const { generate } = narrations;
  const handleSubmit = useCallback(() => {
    const content = text.trim();
    if (!selected || !content) return;
    generate(content, selected.id, `${formatVoiceName(selected.name)} · ${languageLabel(selected.language)}`);
    setText('');
  }, [generate, selected, text, setText]);

  const { download, remove } = voices;
  const handleDownload = useCallback((id: string) => void download(id), [download]);
  const handleRemoveVoice = useCallback((id: string) => void remove(id), [remove]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>Narra</span>
        {engine && <span className={styles.engine}>motor {engine.kind}</span>}
      </header>

      <main className={styles.scroll}>
        <div className={styles.column}>
          <NarrationList items={narrations.items} onRemove={narrations.remove} onClear={narrations.clear} />
        </div>
      </main>

      <footer className={styles.dock}>
        <div className={styles.column}>
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

          <Composer
            value={text}
            onChange={setText}
            onSubmit={handleSubmit}
            onStop={narrations.cancel}
            running={narrations.running}
            blockedReason={blockedReason}
            enterToSend={enterToSend}
            onEnterToSendChange={setEnterToSend}
            maxLength={MAX_TEXT_LENGTH}
            toolbar={
              <VoiceControls
                languages={voices.languages}
                language={voices.language}
                voices={voices.voices}
                selected={selected}
                downloadPct={downloadPct}
                loading={voices.loading}
                disabled={narrations.running}
                onLanguageChange={voices.selectLanguage}
                onVoiceChange={voices.selectVoice}
                onDownload={handleDownload}
                onCancelDownload={voices.cancelDownload}
                onRemove={handleRemoveVoice}
              />
            }
            footer={<VoiceNotice voice={selected} />}
          />
        </div>
      </footer>
    </div>
  );
}
