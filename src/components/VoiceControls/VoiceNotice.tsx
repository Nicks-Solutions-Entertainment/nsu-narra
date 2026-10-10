import { memo } from 'react';
import type { VoiceInfo } from '@/engine';
import styles from './VoiceNotice.module.css';

/**
 * Linha de créditos/licença da voz selecionada.
 * Vozes da comunidade mostram autor e licença; as não comerciais são destacadas.
 */
export const VoiceNotice = memo(function VoiceNotice({ voice }: { voice: VoiceInfo | null }) {
  if (!voice) return null;

  const link = voice.homepage && (
    <a href={voice.homepage} target="_blank" rel="noreferrer">
      ver licença
    </a>
  );

  if (voice.source === 'community') {
    return (
      <p className={styles.notice}>
        Voz da comunidade · {voice.attribution} · {voice.license}
        {voice.commercialUse === false && <strong className={styles.warn}> · somente uso não comercial</strong>}
        {link && <> · {link}</>}
      </p>
    );
  }

  return (
    <p className={styles.notice}>
      Voz oficial Piper · confira a licença antes de uso comercial{link && <> · {link}</>}
    </p>
  );
});

