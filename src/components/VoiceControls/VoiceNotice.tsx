import Link from 'next/link';
import { memo } from 'react';
import type { VoiceInfo } from '@/engine';
import { COMMERCIAL_LABEL, licenseSummary } from '@/lib/licenses';
import { TERMS_PATH } from '@/lib/terms-content';
import { LicenseBadge } from '../LicenseBadge/LicenseBadge';
import styles from './VoiceNotice.module.css';

/**
 * Linha de licença da voz selecionada: selo ⚖, situação de uso comercial e
 * uma explicação em linguagem simples do que a licença permite.
 *
 * O autor aparece como "Autoria", só para atribuição: as licenças (OpenRAIL-M
 * §8, Apache 2.0 §6, CC "sem endosso") proíbem sugerir parceria ou aprovação.
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
      {voice.attribution && ` Autoria: ${voice.attribution}.`}
      {voice.homepage && (
        <>
          {' '}
          <a href={voice.homepage} target="_blank" rel="noreferrer">
            Licença e detalhes da voz
          </a>
        </>
      )}
      {' · '}
      <Link href={TERMS_PATH}>Termos de uso</Link>
    </p>
  );
});
