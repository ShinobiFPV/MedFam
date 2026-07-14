import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Appointment, Doctor } from '../types';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import formStyles from '../styles/form.module.css';
import styles from './Medications.module.css';

interface AppointmentsScreenProps {
  personId: number;
}

interface AppointmentFormState {
  doctor_id: string;
  datetimeLocal: string;
  location: string;
  prep_notes: string;
}

const EMPTY_FORM: AppointmentFormState = { doctor_id: '', datetimeLocal: '', location: '', prep_notes: '' };

function toDatetimeLocalValue(isoUtc: string): string {
  const d = new Date(isoUtc);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentsScreen({ personId }: AppointmentsScreenProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<AppointmentFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [appts, docs] = await Promise.all([api.getAppointments(personId), api.getDoctors(personId)]);
      setAppointments(appts.slice().sort((a, b) => a.datetime_utc.localeCompare(b.datetime_utc)));
      setDoctors(docs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  const doctorName = (id: number | null) => doctors.find((d) => d.id === id)?.name ?? '—';

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError('');
    setCreating(true);
  };

  const openEdit = (appt: Appointment) => {
    setForm({
      doctor_id: appt.doctor_id != null ? String(appt.doctor_id) : '',
      datetimeLocal: toDatetimeLocalValue(appt.datetime_utc),
      location: appt.location || '',
      prep_notes: appt.prep_notes || '',
    });
    setError('');
    setEditing(appt);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
  };

  const save = async () => {
    if (!form.datetimeLocal) {
      setError('Date and time are required');
      return;
    }
    const d = new Date(form.datetimeLocal);
    if (isNaN(d.getTime())) {
      setError('Invalid date/time');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        person_id: personId,
        doctor_id: form.doctor_id ? Number(form.doctor_id) : null,
        datetime_utc: d.toISOString(),
        location: form.location || null,
        prep_notes: form.prep_notes || null,
      };
      if (editing) {
        await api.updateAppointment(editing.id, payload);
      } else {
        await api.createAppointment(payload);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (appt: Appointment) => {
    if (!confirm('Delete this appointment?')) return;
    try {
      await api.deleteAppointment(appt.id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  };

  const confirmAppointment = async (appt: Appointment) => {
    try {
      await api.confirmAppointment(appt.id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to confirm');
    }
  };

  return (
    <div>
      <div className={styles.headerRow}>
        <button type="button" className={formStyles.primaryButton} onClick={openCreate}>
          + Add appointment
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <DataTable
          columns={[
            {
              key: 'datetime_utc',
              label: 'When',
              render: (a) => new Date(a.datetime_utc).toLocaleString(),
            },
            { key: 'doctor', label: 'Doctor', render: (a) => doctorName(a.doctor_id) },
            { key: 'location', label: 'Location' },
            {
              key: 'confirmed',
              label: 'Confirmed',
              render: (a) => (a.confirmed_at ? `Yes (${new Date(a.confirmed_at).toLocaleDateString()})` : 'No'),
            },
          ]}
          rows={appointments}
          onEdit={openEdit}
          onDelete={remove}
          emptyMessage="No appointments yet."
          extraAction={(a) =>
            !a.confirmed_at ? (
              <button type="button" onClick={() => confirmAppointment(a)}>
                Confirm
              </button>
            ) : null
          }
        />
      )}

      {(creating || editing) && (
        <Modal
          title={editing ? 'Edit appointment' : 'Add appointment'}
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
              <label htmlFor="appt-datetime">Date &amp; time</label>
              <input
                id="appt-datetime"
                type="datetime-local"
                value={form.datetimeLocal}
                onChange={(e) => setForm({ ...form, datetimeLocal: e.target.value })}
              />
            </div>
            <div className={formStyles.field}>
              <label htmlFor="appt-doctor">Doctor</label>
              <select
                id="appt-doctor"
                value={form.doctor_id}
                onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}
              >
                <option value="">—</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={formStyles.field}>
            <label htmlFor="appt-location">Location</label>
            <input
              id="appt-location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div className={formStyles.field}>
            <label htmlFor="appt-prep">Prep notes</label>
            <textarea
              id="appt-prep"
              value={form.prep_notes}
              onChange={(e) => setForm({ ...form, prep_notes: e.target.value })}
              placeholder="e.g. Bring blood pressure log."
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
