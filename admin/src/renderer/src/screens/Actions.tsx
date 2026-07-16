import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Action, Schedule } from '../types';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import formStyles from '../styles/form.module.css';
import styles from './Medications.module.css';

interface ActionsScreenProps {
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

const CATEGORY_SUGGESTIONS = ['Exercise', 'Physio', 'Stretching', 'Breathing', 'Other'];

interface ActionFormState {
  name: string;
  category: string;
  notes: string;
  times: string[];
  daysMode: 'daily' | 'custom';
  customDays: string[];
  active: boolean;
}

const EMPTY_FORM: ActionFormState = {
  name: '',
  category: '',
  notes: '',
  times: ['09:00'],
  daysMode: 'daily',
  customDays: [],
  active: true,
};

function scheduleToForm(json: string): Pick<ActionFormState, 'times' | 'daysMode' | 'customDays'> {
  try {
    const schedule: Schedule = JSON.parse(json);
    return {
      times: schedule.times?.length ? schedule.times : ['09:00'],
      daysMode: schedule.days === 'daily' ? 'daily' : 'custom',
      customDays: Array.isArray(schedule.days) ? schedule.days : [],
    };
  } catch {
    return { times: ['09:00'], daysMode: 'daily', customDays: [] };
  }
}

function formatSchedule(action: Action): string {
  try {
    const schedule: Schedule = JSON.parse(action.schedule_json);
    const days = schedule.days === 'daily' ? 'daily' : (schedule.days as string[]).join(', ');
    return `${schedule.times.join(', ')} · ${days}`;
  } catch {
    return action.schedule_json;
  }
}

export function ActionsScreen({ personId }: ActionsScreenProps) {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Action | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ActionFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setActions(await api.getActions(personId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load actions');
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

  const openEdit = (action: Action) => {
    setForm({
      name: action.name,
      category: action.category || '',
      notes: action.notes || '',
      active: !!action.active,
      ...scheduleToForm(action.schedule_json),
    });
    setError('');
    setEditing(action);
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

  const addTime = () => setForm({ ...form, times: [...form.times, '09:00'] });
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
      setError('At least one scheduled time is required');
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
        category: form.category.trim() || null,
        notes: form.notes || null,
        schedule_json: JSON.stringify(schedule),
        active: form.active ? 1 : 0,
      };
      if (editing) {
        await api.updateAction(editing.id, payload);
      } else {
        await api.createAction(payload);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (action: Action) => {
    if (!confirm(`Delete ${action.name}? This also removes its completion history.`)) return;
    try {
      await api.deleteAction(action.id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  };

  return (
    <div>
      <div className={styles.headerRow}>
        <button type="button" className={formStyles.primaryButton} onClick={openCreate}>
          + Add action
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'category', label: 'Category', render: (a) => a.category || '—' },
            { key: 'schedule', label: 'Schedule', render: formatSchedule },
            { key: 'active', label: 'Active', render: (a) => (a.active ? 'Yes' : 'No') },
          ]}
          rows={actions}
          onEdit={openEdit}
          onDelete={remove}
          emptyMessage="No actions yet."
        />
      )}

      {(creating || editing) && (
        <Modal
          title={editing ? 'Edit action' : 'Add action'}
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
              <label htmlFor="action-name">Name</label>
              <input
                id="action-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ankle stretches"
              />
            </div>
            <div className={formStyles.field}>
              <label htmlFor="action-category">Category</label>
              <input
                id="action-category"
                list="action-category-suggestions"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Exercise"
              />
              <datalist id="action-category-suggestions">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className={formStyles.field}>
              <label htmlFor="action-active">Active</label>
              <select
                id="action-active"
                value={form.active ? 'yes' : 'no'}
                onChange={(e) => setForm({ ...form, active: e.target.value === 'yes' })}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
          <div className={formStyles.field}>
            <label htmlFor="action-notes">Notes</label>
            <textarea
              id="action-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Plain-language note shown to the family (e.g. what to do, how many reps)"
            />
          </div>

          <div className={formStyles.field}>
            <label>Scheduled times</label>
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
                  name="action-days-mode"
                  checked={form.daysMode === 'daily'}
                  onChange={() => setForm({ ...form, daysMode: 'daily' })}
                />
                Every day
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="action-days-mode"
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
