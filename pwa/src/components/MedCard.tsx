import type { CSSProperties } from 'react';
import type { Dose } from '../types';
import { formatScheduledTime } from '../lib/timezone';
import styles from './MedCard.module.css';

interface MedCardProps {
  dose: Dose;
  onToggle: (dose: Dose, nextTaken: boolean) => void;
  onShowInfo: (dose: Dose) => void;
}

export function MedCard({ dose, onToggle, onShowInfo }: MedCardProps) {
  const handleToggle = () => onToggle(dose, !dose.taken);

  const style = { '--stripe-color': dose.color || 'var(--color-primary)' } as CSSProperties;

  return (
    <div
      className={styles.card}
      data-taken={dose.taken}
      style={style}
      role="button"
      tabIndex={0}
      aria-pressed={dose.taken}
      aria-label={`${dose.name}${dose.dosage ? `, ${dose.dosage}` : ''}, ${formatScheduledTime(dose.scheduled_time)}, ${dose.taken ? 'taken' : 'not taken'}`}
      onClick={handleToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle();
        }
      }}
    >
      <div className={styles.stripe} />
      <div className={styles.body}>
        <div className={styles.name}>{dose.name}</div>
        <div className={styles.meta}>
          {dose.dosage ? `${dose.dosage} · ` : ''}
          {formatScheduledTime(dose.scheduled_time)}
        </div>
        {dose.description ? (
          <button
            type="button"
            className={styles.infoButton}
            onClick={(e) => {
              e.stopPropagation();
              onShowInfo(dose);
            }}
          >
            What is this?
          </button>
        ) : null}
      </div>
      <div className={styles.checkWrap} aria-hidden="true">
        {dose.taken ? <span className={styles.check}>✓</span> : <span className={styles.circle} />}
      </div>
    </div>
  );
}
