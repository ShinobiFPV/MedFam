import { useEffect, useState } from 'react';
import { api, ApiError, getBaseUrl, setBaseUrl } from '../api/client';
import formStyles from '../styles/form.module.css';
import styles from './Settings.module.css';

export function SettingsScreen() {
  const [address, setAddress] = useState('');
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    getBaseUrl().then(setAddress);
    window.medfam.getAppVersion().then(setVersion);
  }, []);

  const testAndSave = async () => {
    setStatus('testing');
    setMessage('');
    try {
      await setBaseUrl(address);
      const health = await api.health();
      setStatus('ok');
      setMessage(`Connected — server timezone: ${health.timezone}`);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof ApiError ? err.message : 'Could not connect');
    }
  };

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      await window.medfam.checkForUpdates();
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div>
      <h1 className={styles.title}>Settings</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Server</h2>
        <div className={formStyles.field}>
          <label htmlFor="settings-address">Server address</label>
          <input id="settings-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <button
          type="button"
          className={formStyles.primaryButton}
          onClick={testAndSave}
          disabled={status === 'testing'}
        >
          {status === 'testing' ? 'Testing…' : 'Test & save'}
        </button>
        {message && <div className={status === 'error' ? formStyles.error : styles.success}>{message}</div>}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>About</h2>
        <div className={styles.aboutLine}>MedFam Admin v{version}</div>
        <button
          type="button"
          className={formStyles.secondaryButton}
          onClick={checkForUpdates}
          disabled={checkingUpdate}
        >
          {checkingUpdate ? 'Checking…' : 'Check for updates'}
        </button>
      </section>
    </div>
  );
}
