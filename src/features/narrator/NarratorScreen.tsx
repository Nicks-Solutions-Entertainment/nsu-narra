'use client';

import { useCallback, useMemo } from 'react';
import { DEFAULT_SPEED, DEFAULT_STEPS, DEFAULT_VARIATION, SPEED_RANGE, STEPS_RANGE, VARIATION_RANGE } from '@/engine';
import { Alert } from '@/components/Alert/Alert';
import { AppHeader } from '@/components/AppHeader/AppHeader';
import { Composer } from '@/components/Composer/Composer';
import { NarrationList } from '@/components/NarrationList/NarrationList';
import { VoiceControls } from '@/components/VoiceControls/VoiceControls';
import { VoiceNotice } from '@/components/VoiceControls/VoiceNotice';
import { useDraft } from '@/hooks/useDraft';
import { useEngine } from '@/hooks/useEngine';
import { useNarrations } from '@/hooks/useNarrations';
import { useBooleanPreference, useNumberPreference } from '@/hooks/usePreference';
import { useVoicePreview } from '@/hooks/useVoicePreview';
import { useVoices } from '@/hooks/useVoices';
import { formatVoiceName } from '@/lib/format';
import { languageLabel } from '@/lib/languages';
import { PREF_KEYS } from '@/lib/storage';
import { useTermsAccepted } from '@/lib/terms';
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
  const [commercialOnly, setCommercialOnly] = useBooleanPreference(PREF_KEYS.commercialOnly, false);
  const [steps, setSteps] = useNumberPreference(PREF_KEYS.steps, DEFAULT_STEPS, STEPS_RANGE);
  const [speed, setSpeed] = useNumberPreference(PREF_KEYS.speed, DEFAULT_SPEED, SPEED_RANGE);
  const [variation, setVariation] = useNumberPreference(PREF_KEYS.rhythmVariation, DEFAULT_VARIATION, VARIATION_RANGE);
  const settings = useMemo(
    () => ({
      speed,
      steps,
      variation,
      onSpeedChange: setSpeed,
      onStepsChange: setSteps,
      onVariationChange: setVariation,
    }),
    [speed, steps, variation, setSpeed, setSteps, setVariation],
  );
  const preview = useVoicePreview(engine, narrations.running);

  const { selected, downloads } = voices;
  const downloadPct = selected ? downloads[selected.id] : undefined;
  const termsAccepted = useTermsAccepted();

  const blockedReason =
    termsAccepted === false
      ? 'Aceite os Termos de Uso para gerar áudio.'
      : !engine
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
    generate(content, selected.id, `${formatVoiceName(selected.name)} · ${languageLabel(selected.language)}`, {
      steps: selected.family === 'supertonic' ? steps : undefined,
      speed,
      variation,
    });
    setText('');
  }, [generate, selected, text, setText, steps, speed, variation]);

  const { download, remove } = voices;
  const handleDownload = useCallback((id: string) => void download(id), [download]);
  const handleRemoveVoice = useCallback((ids: string | string[]) => void remove(ids), [remove]);

  return (
    <div className={styles.shell}>
      <AppHeader>{engine && <span className={styles.engine}>motor {engine.kind}</span>}</AppHeader>

      <main className={styles.scroll}>
        <div className={styles.column}>
          <NarrationList
            items={narrations.items}
            onRemove={narrations.remove}
            onRegenerate={narrations.regenerate}
            onSelectVersion={narrations.selectVersion}
            running={narrations.running}
            onClear={narrations.clear}
          />
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
                installed={voices.installed}
                installedBytes={voices.installedBytes}
                selected={selected}
                downloads={downloads}
                preview={preview}
                loading={voices.loading}
                commercialOnly={commercialOnly}
                onCommercialOnlyChange={setCommercialOnly}
                disabled={narrations.running}
                onLanguageChange={voices.selectLanguage}
                onVoiceChange={voices.selectVoice}
                onDownload={handleDownload}
                onCancelDownload={voices.cancelDownload}
                onRemove={handleRemoveVoice}
                settings={settings}
              />
            }
            footer={<VoiceNotice voice={selected} />}
          />
        </div>
      </footer>
    </div>
  );
}
