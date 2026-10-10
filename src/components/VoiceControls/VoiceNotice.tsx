import { memo } from 'react';
import type { VoiceInfo } from '@/engine';
import { COMMERCIAL_LABEL, licenseSummary } from '@/lib/licenses';
import { LicenseBadge } from '../LicenseBadge/LicenseBadge';
import styles from './VoiceNotice.module.css';

/**
 * Linha de licença da voz selecionada: selo ⚖, situação de uso comercial e
 * uma explicação em linguagem simples do que a licença permite.
 */
export const VoiceNotice = memo(function VoiceNotice({ voice }: { voice: VoiceInfo | null }) {
  if (!voice) return null;
  const summary = licenseSummary(voice.license);

  return (
    <p className={styles.notice}>
      <LicenseBadge license={voice.license} commercial={voice.commercial} licenseNote={voice.licenseNote} />
      <span className={styles.status} data-commercial={voice.commercial}>
        {' '}
        · {COMMERCIAL_LABEL[voice.commercial]}
      </span>
      {voice.licenseNote ? ` — ${voice.licenseNote}` : summary ? ` — ${summary}` : ''}
      {voice.attribution && ` Crédito: ${voice.attribution}.`}
      {voice.homepage && (
        <>
          {' '}
          <a href={voice.homepage} target="_blank" rel="noreferrer">
            Ver cartão da voz
          </a>
        </>
      )}
    </p>
  );
});
