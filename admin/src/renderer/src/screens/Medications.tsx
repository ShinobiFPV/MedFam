import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Medication, Schedule } from '../types';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import formStyles from '../styles/form.module.css';
import styles from './Medications.module.css';

interface MedicationsScreenProps {
  personId: number;
}

const DAY_LABELS: Array<{ key: string; label: string }> = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

interface MedicationFormState {
  name: string;
  dosage: string;
  color: string;
  description: string;
  times: string[];
  daysMode: 'daily' | 'custom';
  customDays: string[];
  active: boolean;
}

const EMPTY_FORM: MedicationFormState = {
  name: '',
  dosage: '',
  color: '#4C6EF5',
  description: '',
  times: ['08:00'],
  daysMode: 'daily',
  customDays: [],
  active: true,
};

function scheduleToForm(json: string): Pick<MedicationFormState, 'times' | 'daysMode' | 'customDays'> {
  try {
    const schedule: Schedule = JSON.parse(json);
    return {
      times: schedule.times?.length ? schedule.times : ['08:00'],
      daysMode: schedule.days === 'daily' ? 'daily' : 'custom',
      customDays: Array.isArray(schedule.days) ? schedule.days : [],
    };
  } catch {
    return { times: ['08:00'], daysMode: 'daily', customDays: [] };
  }
}

function formatSchedule(med: Medication): string {
  try {
    const schedule: Schedule = JSON.parse(med.schedule_json);
    const days = schedule.days === 'daily' ? 'daily' : (schedule.days as string[]).join(', ');
    return `${schedule.times.join(', ')} · ${days}`;
  } catch {
    return med.schedule_json;
  }
}

export function MedicationsScreen({ personId }: MedicationsScreenProps) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<MedicationFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setMedications(await api.getMedications(personId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load medications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError('');
    setCreating(true);
  };

  const openEdit = (med: Medication) => {
    setForm({
      name: med.name,
      dosage: med.dosage || '',
      color: med.color || '#4C6EF5',
      description: med.description || '',
      active: !!med.active,
      ...scheduleToForm(med.schedule_json),
    });
    setError('');
    setEditing(med);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
  };

  const updateTime = (index: number, value: string) => {
    const times = [...form.times];
    times[index] = value;
    setForm({ ...form, times });
  };

  const addTime = () => setForm({ ...form, times: [...form.times, '08:00'] });
  const removeTime = (index: number) => setForm({ ...form, times: form.times.filter((_, i) => i !== index) });

  const toggleDay = (day: string) => {
    setForm({
      ...form,
      customDays: form.customDays.includes(day) ? form.customDays.filter((d) => d !== day) : [...form.customDays, day],
    });
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (form.times.length === 0 || form.times.some((t) => !t)) {
      setError('At least one dose time is required');
      return;
    }
    if (form.daysMode === 'custom' && form.customDays.length === 0) {
      setError('Pick at least one day, or choose "Every day"');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const schedule: Schedule = {
        times: form.times,
        days: form.daysMode === 'daily' ? 'daily' : form.customDays,
      };
      const payload = {
        person_id: personId,
        name: form.name.trim(),
        dosage: form.dosage || null,
        color: form.color || null,
        description: form.description || null,
        schedule_json: JSON.stringify(schedule),
        active: form.active ? 1 : 0,
      };
      if (editing) {
        await api.updateMedication(editing.id, payload);
      } else {
        await api.createMedication(payload);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (med: Medication) => {
    if (!confirm(`Delete ${med.name}? This also removes its dose history.`)) return;
    try {
      await api.deleteMedication(med.id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  };

  return (
    <div>
      <div className={styles.headerRow}>
        <button type="button" className={formStyles.primaryButton} onClick={openCreate}>
          + Add medication
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <DataTable
          columns={[
            {
              key: 'name',
              label: 'Name',
              render: (m) => (
                <span className={styles.nameCell}>
                  <span className={styles.colorDot} style={{ background: m.color || '#ccc' }} />
                  {m.name}
                </span>
              ),
            },
            { key: 'dosage', label: 'Dosage' },
            { key: 'schedule', label: 'Schedule', render: formatSchedule },
            { key: 'active', label: 'Active', render: (m) => (m.active ? 'Yes' : 'No') },
          ]}
          rows={medications}
          onEdit={openEdit}
          onDelete={remove}
          emptyMessage="No medications yet."
        />
      )}

      {(creating || editing) && (
        <Modal
          title={editing ? 'Edit medication' : 'Add medication'}
          onClose={closeModal}
          footer={
            <>
              <button type="button" className={formStyles.secondaryButton} onClick={closeModal}>
                Cancel
              </button>
              <button type="button" className={formStyles.primaryButton} onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          {error && <div className={formStyles.error}>{error}</div>}
          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label htmlFor="med-name">Name</label>
              <input id="med-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className={formStyles.field}>
              <label htmlFor="med-dosage">Dosage</label>
              <input
                id="med-dosage"
                value={form.dosage}
                onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                placeholder="10mg"
              />
            </div>
          </div>
          <div className={formStyles.field}>
            <label htmlFor="med-description">Description</label>
            <textarea
              id="med-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Plain-language note shown to the family (e.g. what it's for, how to take it)"
            />
          </div>
          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label htmlFor="med-color">Color</label>
              <input id="med-color" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </div>
            <div className={formStyles.field}>
              <label htmlFor="med-active">Active</label>
              <select
                id="med-active"
                value={form.active ? 'yes' : 'no'}
                onChange={(e) => setForm({ ...form, active: e.target.value === 'yes' })}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className={formStyles.field}>
            <label>Dose times</label>
            <div className={styles.timesList}>
              {form.times.map((time, i) => (
                <div key={i} className={styles.timeRow}>
                  <input type="time" value={time} onChange={(e) => updateTime(i, e.target.value)} />
                  {form.times.length > 1 && (
                    <button type="button" className={styles.removeTimeButton} onClick={() => removeTime(i)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className={formStyles.secondaryButton} onClick={addTime}>
                + Add time
              </button>
            </div>
          </div>

          <div className={formStyles.field}>
            <label>Days</label>
            <div className={styles.daysMode}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="days-mode"
                  checked={form.daysMode === 'daily'}
                  onChange={() => setForm({ ...form, daysMode: 'daily' })}
                />
                Every day
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="days-mode"
                  checked={form.daysMode === 'custom'}
                  onChange={() => setForm({ ...form, daysMode: 'custom' })}
                />
                Specific days
              </label>
            </div>
            {form.daysMode === 'custom' && (
              <div className={styles.dayChips}>
                {DAY_LABELS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className={form.customDays.includes(d.key) ? styles.dayChipActive : styles.dayChip}
                    onClick={() => toggleDay(d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
