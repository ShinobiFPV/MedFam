import { useTextSize } from '../context/TextSizeContext';
import { usePerson } from '../context/PersonContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import styles from './Settings.module.css';

interface SettingsScreenProps {
  onBack: () => void;
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const { textSize, setTextSize } = useTextSize();
  const { clearPerson } = usePerson();
  const online = useOnlineStatus();

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </header>

      <main className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Text size</div>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={textSize === 'large' ? styles.toggleActive : styles.toggle}
              onClick={() => setTextSize('large')}
            >
              Large
            </button>
            <button
              type="button"
              className={textSize === 'xl' ? styles.toggleActive : styles.toggle}
              onClick={() => setTextSize('xl')}
            >
              Extra Large
            </button>
          </div>
        </section>

        <button type="button" className={styles.switchPersonLink} onClick={clearPerson}>
          Switch person
        </button>

        <div className={styles.about}>
          {online ? 'Online' : 'Offline'} · MedFam v{__APP_VERSION__}
        </div>
      </main>

      <button type="button" className={styles.backButton} onClick={onBack}>
        Back to Today
      </button>
    </div>
  );
}
