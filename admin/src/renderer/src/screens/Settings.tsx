import { useEffect, useRef, useState } from 'react';
import { api, ApiError, getBaseUrl, setBaseUrl } from '../api/client';
import { Modal } from '../components/Modal';
import formStyles from '../styles/form.module.css';
import styles from './Settings.module.css';

const RESTORE_CONFIRM_PHRASE = 'RESTORE';

export function SettingsScreen() {
  const [address, setAddress] = useState('');
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

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

  const exportAllData = async () => {
    window.open(await api.getBackupExportUrl(), '_blank');
  };

  const cancelRestore = () => {
    setRestoreFile(null);
    setRestoreConfirmText('');
  };

  const confirmRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setRestoreMessage(null);
    try {
      const body = new FormData();
      body.append('file', restoreFile);
      const result = await api.importBackup(body);
      const counts = Object.entries(result.restored)
        .map(([table, count]) => `${count} ${table}`)
        .join(', ');
      setRestoreMessage({ kind: 'success', text: `Restore complete — ${counts}. The data is live now, no restart needed.` });
      cancelRestore();
    } catch (err) {
      setRestoreMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Restore failed' });
    } finally {
      setRestoring(false);
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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Data</h2>
        <div className={styles.aboutLine}>
          Export everyone's data as a single backup file, or restore this server from one.
        </div>
        <button type="button" className={formStyles.secondaryButton} onClick={exportAllData}>
          Export all data
        </button>
        <input
          ref={restoreInputRef}
          type="file"
          accept=".zip"
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) {
              setRestoreMessage(null);
              setRestoreFile(file);
            }
          }}
        />
        <button type="button" className={styles.dangerButton} onClick={() => restoreInputRef.current?.click()}>
          Restore from backup…
        </button>
        {restoreMessage && (
          <div className={restoreMessage.kind === 'error' ? formStyles.error : styles.success}>
            {restoreMessage.text}
          </div>
        )}
      </section>

      {restoreFile && (
        <Modal
          title="Restore from backup"
          onClose={restoring ? () => {} : cancelRestore}
          footer={
            <>
              <button type="button" className={formStyles.secondaryButton} onClick={cancelRestore} disabled={restoring}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={confirmRestore}
                disabled={restoring || restoreConfirmText !== RESTORE_CONFIRM_PHRASE}
              >
                {restoring ? 'Restoring…' : 'Restore and replace everything'}
              </button>
            </>
          }
        >
          <p className={formStyles.error}>
            This replaces ALL people, medications, doctors, appointments, actions, and documents currently on this
            server with the contents of <strong>{restoreFile.name}</strong>. This cannot be undone.
          </p>
          <div className={formStyles.field}>
            <label htmlFor="restore-confirm">
              Type <strong>{RESTORE_CONFIRM_PHRASE}</strong> to confirm
            </label>
            <input
              id="restore-confirm"
              value={restoreConfirmText}
              onChange={(e) => setRestoreConfirmText(e.target.value)}
              disabled={restoring}
              autoFocus
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
