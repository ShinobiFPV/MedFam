import { useState } from 'react';
import { api, setBaseUrl } from '../api/client';
import formStyles from '../styles/form.module.css';
import styles from './ServerSetup.module.css';

interface ServerSetupScreenProps {
  onDone: () => void;
}

export function ServerSetupScreen({ onDone }: ServerSetupScreenProps) {
  const [address, setAddress] = useState('http://192.168.1.203:8093');
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [error, setError] = useState('');

  const testAndSave = async () => {
    setStatus('testing');
    setError('');
    try {
      await setBaseUrl(address);
      const health = await api.health();
      if (health.status !== 'ok') throw new Error('Server reported an unhealthy status');
      setStatus('ok');
      onDone();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not connect');
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>Connect to MedFam</h1>
        <p className={styles.subtitle}>
          Enter the address of your MedFam server — the same one your tablet's browser points at.
        </p>
        <div className={formStyles.field}>
          <label htmlFor="server-address">Server address</label>
          <input
            id="server-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="http://192.168.1.203:8093"
            onKeyDown={(e) => {
              if (e.key === 'Enter') testAndSave();
            }}
          />
        </div>
        {status === 'error' && <div className={formStyles.error}>{error}</div>}
        <button
          type="button"
          className={formStyles.primaryButton}
          onClick={testAndSave}
          disabled={status === 'testing' || !address.trim()}
        >
          {status === 'testing' ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </div>
  );
}
