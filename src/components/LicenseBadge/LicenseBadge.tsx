import type { CommercialUse } from '@/engine';
import { COMMERCIAL_LABEL, licenseTooltip } from '@/lib/licenses';
import { Icon } from '../Icon/Icon';
import styles from './LicenseBadge.module.css';

interface LicenseBadgeProps {
  license: string;
  commercial: CommercialUse;
  licenseNote?: string;
}

/**
 * Selo de licença no estilo do GitHub (⚖ + nome da licença). A cor indica a
 * situação de uso comercial; o tooltip explica o que a licença permite.
 */
export function LicenseBadge({ license, commercial, licenseNote }: LicenseBadgeProps) {
  return (
    <span
      className={styles.badge}
      data-commercial={commercial}
      title={licenseTooltip({ license, commercial, licenseNote })}
    >
      <Icon name="law" size={12} />
      {license}
      <span className="visually-hidden"> · {COMMERCIAL_LABEL[commercial]}</span>
    </span>
  );
}
