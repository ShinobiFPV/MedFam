import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Person } from '../types';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import formStyles from '../styles/form.module.css';
import styles from './People.module.css';

interface PeopleScreenProps {
  onSelectPerson: (id: number, name: string) => void;
}

interface PersonFormState {
  name: string;
  date_of_birth: string;
  notes: string;
}

const EMPTY_FORM: PersonFormState = { name: '', date_of_birth: '', notes: '' };

export function PeopleScreen({ onSelectPerson }: PeopleScreenProps) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Person | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PersonFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setPeople(await api.getPeople());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load people');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError('');
    setCreating(true);
  };

  const openEdit = (person: Person) => {
    setForm({
      name: person.name,
      date_of_birth: person.date_of_birth || '',
      notes: person.notes || '',
    });
    setError('');
    setEditing(person);
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
        name: form.name.trim(),
        date_of_birth: form.date_of_birth || null,
        notes: form.notes || null,
      };
      if (editing) {
        await api.updatePerson(editing.id, payload);
      } else {
        await api.createPerson(payload);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (person: Person) => {
    if (!confirm(`Delete ${person.name}? This removes all of their medications, doctors, and appointments.`)) return;
    try {
      await api.deletePerson(person.id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  };

  const importProfile = async (file: File) => {
    setImporting(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      await api.importPerson(body);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import profile');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>People</h1>
        <div className={styles.headerActions}>
          <input
            ref={importInputRef}
            type="file"
            accept=".zip"
            className={styles.hiddenInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ''; // allow re-selecting the same file next time
              if (file) importProfile(file);
            }}
          />
          <button
            type="button"
            className={formStyles.secondaryButton}
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? 'Importing…' : 'Import profile'}
          </button>
          <button type="button" className={formStyles.primaryButton} onClick={openCreate}>
            + Add person
          </button>
        </div>
      </div>

      {error && !creating && !editing && <div className={formStyles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <DataTable
          columns={[
            {
              key: 'name',
              label: 'Name',
              render: (p) => (
                <button type="button" className={styles.nameLink} onClick={() => onSelectPerson(p.id, p.name)}>
                  {p.name}
                </button>
              ),
            },
            { key: 'date_of_birth', label: 'Date of birth' },
            { key: 'notes', label: 'Notes' },
          ]}
          rows={people}
          onEdit={openEdit}
          onDelete={remove}
          emptyMessage='No one added yet. Click "Add person" to get started.'
        />
      )}

      {(creating || editing) && (
        <Modal
          title={editing ? 'Edit person' : 'Add person'}
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
          <div className={formStyles.field}>
            <label htmlFor="person-name">Name</label>
            <input id="person-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className={formStyles.field}>
            <label htmlFor="person-dob">Date of birth</label>
            <input
              id="person-dob"
              type="date"
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
            />
          </div>
          <div className={formStyles.field}>
            <label htmlFor="person-notes">Notes</label>
            <textarea id="person-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  );
}
