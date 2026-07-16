import styles from './DescriptionSheet.module.css';

export interface DescriptionSheetItem {
  name: string;
  description: string | null;
}

interface DescriptionSheetProps {
  item: DescriptionSheetItem | null;
  onClose: () => void;
}

export function DescriptionSheet({ item, onClose }: DescriptionSheetProps) {
  if (!item) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`About ${item.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.name}>{item.name}</div>
        <div className={styles.description}>{item.description || 'No description available.'}</div>
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
