import type { Dose } from '../types';
import styles from './DescriptionSheet.module.css';

interface DescriptionSheetProps {
  dose: Dose | null;
  onClose: () => void;
}

export function DescriptionSheet({ dose, onClose }: DescriptionSheetProps) {
  if (!dose) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`About ${dose.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.name}>{dose.name}</div>
        <div className={styles.description}>{dose.description || 'No description available.'}</div>
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
