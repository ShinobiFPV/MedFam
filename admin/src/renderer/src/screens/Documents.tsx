import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { MedicalDocument } from '../types';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import formStyles from '../styles/form.module.css';
import styles from './Medications.module.css';

interface DocumentsScreenProps {
  personId: number;
}

const CATEGORY_SUGGESTIONS = [
  'Lab result',
  'Imaging',
  'Referral',
  'Prescription',
  'Insurance',
  'Visit summary',
  'Other',
];

interface DocumentFormState {
  title: string;
  category: string;
  notes: string;
}

const EMPTY_FORM: DocumentFormState = { title: '', category: '', notes: '' };

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// uploaded_at comes from SQLite's datetime('now'): "YYYY-MM-DD HH:MM:SS" UTC,
// with no timezone marker -- append one so Date doesn't treat it as local time.
function formatDate(sqlDatetime: string): string {
  const iso = sqlDatetime.includes('T') ? sqlDatetime : `${sqlDatetime.replace(' ', 'T')}Z`;
  return new Date(iso).toLocaleDateString();
}

export function DocumentsScreen({ personId }: DocumentsScreenProps) {
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MedicalDocument | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<DocumentFormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setDocuments(await api.getDocuments(personId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load documents');
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
    setFile(null);
    setError('');
    setCreating(true);
  };

  const openEdit = (doc: MedicalDocument) => {
    setForm({ title: doc.title, category: doc.category || '', notes: doc.notes || '' });
    setError('');
    setEditing(doc);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    if (creating && !file) {
      setError('Choose a file to upload');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.updateDocument(editing.id, {
          title: form.title.trim(),
          category: form.category.trim() || null,
          notes: form.notes || null,
        });
      } else {
        const body = new FormData();
        body.append('person_id', String(personId));
        body.append('title', form.title.trim());
        if (form.category.trim()) body.append('category', form.category.trim());
        if (form.notes) body.append('notes', form.notes);
        body.append('file', file as File);
        await api.uploadDocument(body);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (doc: MedicalDocument) => {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await api.deleteDocument(doc.id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  };

  const view = async (doc: MedicalDocument) => {
    const url = await api.getDocumentFileUrl(doc.id);
    window.open(url, '_blank');
  };

  return (
    <div>
      <div className={styles.headerRow}>
        <button type="button" className={formStyles.primaryButton} onClick={openCreate}>
          + Upload document
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: 'title', label: 'Title' },
            { key: 'category', label: 'Category', render: (d) => d.category || '—' },
            { key: 'original_filename', label: 'File' },
            { key: 'size_bytes', label: 'Size', render: (d) => formatSize(d.size_bytes) },
            { key: 'uploaded_at', label: 'Uploaded', render: (d) => formatDate(d.uploaded_at) },
          ]}
          rows={documents}
          onEdit={openEdit}
          onDelete={remove}
          extraAction={(d) => (
            <button type="button" onClick={() => view(d)}>
              View
            </button>
          )}
          emptyMessage="No documents yet."
        />
      )}

      {(creating || editing) && (
        <Modal
          title={editing ? 'Edit document' : 'Upload document'}
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
              <label htmlFor="doc-title">Title</label>
              <input
                id="doc-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="ER referral letter"
              />
            </div>
            <div className={formStyles.field}>
              <label htmlFor="doc-category">Category</label>
              <input
                id="doc-category"
                list="doc-category-suggestions"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Referral"
              />
              <datalist id="doc-category-suggestions">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          <div className={formStyles.field}>
            <label htmlFor="doc-notes">Notes</label>
            <textarea
              id="doc-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any context worth remembering about this document"
            />
          </div>
          {creating && (
            <div className={formStyles.field}>
              <label htmlFor="doc-file">File</label>
              <input
                id="doc-file"
                type="file"
                accept=".pdf,.doc,.docx,.heic,.heif,.tif,.tiff,image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
