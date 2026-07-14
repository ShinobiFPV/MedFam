import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { DoseHistoryEntry } from '../types';
import styles from './Compliance.module.css';

interface ComplianceScreenProps {
  personId: number;
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ComplianceScreen({ personId }: ComplianceScreenProps) {
  const [from, setFrom] = useState(isoDateDaysAgo(30));
  const [to, setTo] = useState(todayIsoDate());
  const [entries, setEntries] = useState<DoseHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(await api.getDoseHistory(personId, from, to));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load dose history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  const grouped = entries.reduce<Record<string, DoseHistoryEntry[]>>((acc, entry) => {
    (acc[entry.scheduled_date] ??= []).push(entry);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const takenCount = entries.filter((e) => e.taken_at).length;
  const rate = entries.length ? Math.round((takenCount / entries.length) * 100) : null;

  return (
    <div>
      <div className={styles.controls}>
        <div className={styles.rangeField}>
          <label htmlFor="from-date">From</label>
          <input id="from-date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className={styles.rangeField}>
          <label htmlFor="to-date">To</label>
          <input id="to-date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className={styles.loadButton} onClick={load}>
          Update
        </button>
        {rate !== null && (
          <div className={styles.rate}>
            {takenCount}/{entries.length} doses taken ({rate}%)
          </div>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : dates.length === 0 ? (
        <div className={styles.empty}>No dose history in this date range.</div>
      ) : (
        <div className={styles.dateList}>
          {dates.map((date) => (
            <div key={date} className={styles.dateGroup}>
              <div className={styles.dateHeading}>
                {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              <div className={styles.doseRows}>
                {grouped[date]
                  .slice()
                  .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
                  .map((entry) => (
                    <div key={entry.dose_event_id} className={styles.doseRow}>
                      <span className={styles.doseColorDot} style={{ background: entry.color || '#ccc' }} />
                      <span className={styles.doseName}>{entry.name}</span>
                      <span className={styles.doseDosage}>{entry.dosage}</span>
                      <span className={styles.doseTime}>{entry.scheduled_time}</span>
                      <span className={entry.taken_at ? styles.statusTaken : styles.statusMissed}>
                        {entry.taken_at ? 'Taken' : 'Not taken'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
