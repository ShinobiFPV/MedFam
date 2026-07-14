import { useEffect, useState } from 'react';
import { getBaseUrl } from './api/client';
import { ServerSetupScreen } from './screens/ServerSetup';
import { PeopleScreen } from './screens/People';
import { PersonDetail } from './screens/PersonDetail';
import { SettingsScreen } from './screens/Settings';
import styles from './App.module.css';

type Screen = 'people' | 'person' | 'settings';

export default function App() {
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);
  const [screen, setScreen] = useState<Screen>('people');
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [selectedPersonName, setSelectedPersonName] = useState('');

  useEffect(() => {
    getBaseUrl().then((url) => setServerConfigured(!!url));
  }, []);

  if (serverConfigured === null) {
    return <div className={styles.loading}>Loading…</div>;
  }

  if (!serverConfigured) {
    return <ServerSetupScreen onDone={() => setServerConfigured(true)} />;
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar}>
        <div className={styles.brand}>MedFam Admin</div>
        <button
          type="button"
          className={screen === 'people' ? styles.navActive : styles.navItem}
          onClick={() => {
            setScreen('people');
            setSelectedPersonId(null);
          }}
        >
          People
        </button>
        {selectedPersonId !== null && (
          <div className={styles.personContext}>Managing: {selectedPersonName}</div>
        )}
        <div className={styles.sidebarSpacer} />
        <button
          type="button"
          className={screen === 'settings' ? styles.navActive : styles.navItem}
          onClick={() => setScreen('settings')}
        >
          Settings
        </button>
      </nav>
      <main className={styles.content}>
        {screen === 'people' && (
          <PeopleScreen
            onSelectPerson={(id, name) => {
              setSelectedPersonId(id);
              setSelectedPersonName(name);
              setScreen('person');
            }}
          />
        )}
        {screen === 'person' && selectedPersonId !== null && (
          <PersonDetail
            personId={selectedPersonId}
            personName={selectedPersonName}
            onBack={() => {
              setScreen('people');
              setSelectedPersonId(null);
            }}
          />
        )}
        {screen === 'settings' && <SettingsScreen />}
      </main>
    </div>
  );
}
