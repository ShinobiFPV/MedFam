import type { ActionDose } from '../types';
import { formatScheduledTime } from '../lib/timezone';
import styles from './ActionCard.module.css';

interface ActionCardProps {
  action: ActionDose;
  onToggle: (action: ActionDose, nextDone: boolean) => void;
  onShowInfo: (action: ActionDose) => void;
}

export function ActionCard({ action, onToggle, onShowInfo }: ActionCardProps) {
  const handleToggle = () => onToggle(action, !action.done);

  return (
    <div
      className={styles.card}
      data-done={action.done}
      role="button"
      tabIndex={0}
      aria-pressed={action.done}
      aria-label={`${action.name}${action.category ? `, ${action.category}` : ''}, ${formatScheduledTime(action.scheduled_time)}, ${action.done ? 'done' : 'not done'}`}
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
        <div className={styles.name}>{action.name}</div>
        <div className={styles.meta}>
          {action.category ? `${action.category} · ` : ''}
          {formatScheduledTime(action.scheduled_time)}
        </div>
        {action.notes ? (
          <button
            type="button"
            className={styles.infoButton}
            onClick={(e) => {
              e.stopPropagation();
              onShowInfo(action);
            }}
          >
            What is this?
          </button>
        ) : null}
      </div>
      <div className={styles.checkWrap} aria-hidden="true">
        {action.done ? <span className={styles.check}>✓</span> : <span className={styles.circle} />}
      </div>
    </div>
  );
}
