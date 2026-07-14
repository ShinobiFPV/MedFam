import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Doctor } from '../types';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import formStyles from '../styles/form.module.css';
import styles from './Medications.module.css';

interface DoctorsScreenProps {
  personId: number;
}

interface DoctorFormState {
  name: string;
  specialty: string;
  phone: string;
  address: string;
  notes: string;
}

const EMPTY_FORM: DoctorFormState = { name: '', specialty: '', phone: '', address: '', notes: '' };

export function DoctorsScreen({ personId }: DoctorsScreenProps) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<DoctorFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setDoctors(await api.getDoctors(personId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load doctors');
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

  const openEdit = (doctor: Doctor) => {
    setForm({
      name: doctor.name,
      specialty: doctor.specialty || '',
      phone: doctor.phone || '',
      address: doctor.address || '',
      notes: doctor.notes || '',
    });
    setError('');
    setEditing(doctor);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        person_id: personId,
        name: form.name.trim(),
        specialty: form.specialty || null,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
      };
      if (editing) {
        await api.updateDoctor(editing.id, payload);
      } else {
        await api.createDoctor(payload);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (doctor: Doctor) => {
    if (!confirm(`Delete ${doctor.name}?`)) return;
    try {
      await api.deleteDoctor(doctor.id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  };

  return (
    <div>
      <div className={styles.headerRow}>
        <button type="button" className={formStyles.primaryButton} onClick={openCreate}>
          + Add doctor
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'specialty', label: 'Specialty' },
            { key: 'phone', label: 'Phone' },
            { key: 'address', label: 'Address' },
          ]}
          rows={doctors}
          onEdit={openEdit}
          onDelete={remove}
          emptyMessage="No doctors yet."
        />
      )}

      {(creating || editing) && (
        <Modal
          title={editing ? 'Edit doctor' : 'Add doctor'}
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
              <label htmlFor="doc-name">Name</label>
              <input id="doc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className={formStyles.field}>
              <label htmlFor="doc-specialty">Specialty</label>
              <input
                id="doc-specialty"
                value={form.specialty}
                onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              />
            </div>
          </div>
          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label htmlFor="doc-phone">Phone</label>
              <input id="doc-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className={formStyles.field}>
              <label htmlFor="doc-address">Address</label>
              <input
                id="doc-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          <div className={formStyles.field}>
            <label htmlFor="doc-notes">Notes</label>
            <textarea id="doc-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  );
}
