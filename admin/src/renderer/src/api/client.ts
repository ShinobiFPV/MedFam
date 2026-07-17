import type {
  Action,
  Appointment,
  Doctor,
  DoseHistoryEntry,
  Medication,
  MedicalDocument,
  Person,
  RecurrenceRule,
} from '../types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

let cachedBaseUrl: string | null = null;

export async function getBaseUrl(): Promise<string> {
  if (cachedBaseUrl === null) {
    cachedBaseUrl = await window.medfam.getServerAddress();
  }
  return cachedBaseUrl;
}

export async function setBaseUrl(address: string): Promise<void> {
  const trimmed = address.trim().replace(/\/+$/, '');
  await window.medfam.setServerAddress(trimmed);
  cachedBaseUrl = trimmed;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await getBaseUrl();
  if (!base) throw new ApiError(0, 'No server address configured');

  let res: Response;
  try {
    res = await fetch(`${base}/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init,
    });
  } catch {
    throw new ApiError(0, `Could not reach ${base} — check the server address in Settings.`);
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response wasn't JSON; keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Separate from request() because a multipart body must not have a
// Content-Type header set manually -- the browser needs to add its own
// boundary parameter, which fetch only does when Content-Type is omitted.
async function requestFormData<T>(path: string, formData: FormData): Promise<T> {
  const base = await getBaseUrl();
  if (!base) throw new ApiError(0, 'No server address configured');

  let res: Response;
  try {
    res = await fetch(`${base}/api${path}`, { method: 'POST', body: formData });
  } catch {
    throw new ApiError(0, `Could not reach ${base} — check the server address in Settings.`);
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response wasn't JSON; keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

type NewPerson = Pick<Person, 'name'> & Partial<Pick<Person, 'date_of_birth' | 'notes'>>;
type NewMedication = Pick<Medication, 'person_id' | 'name' | 'schedule_json'> &
  Partial<Pick<Medication, 'brand_name' | 'dosage' | 'color' | 'description' | 'active'>>;
type NewDoctor = Pick<Doctor, 'person_id' | 'name'> & Partial<Pick<Doctor, 'specialty' | 'phone' | 'address' | 'notes'>>;
type NewAction = Pick<Action, 'person_id' | 'name' | 'schedule_json'> &
  Partial<Pick<Action, 'category' | 'notes' | 'active'>>;
type NewAppointment = Pick<Appointment, 'person_id' | 'datetime_utc'> &
  Partial<Pick<Appointment, 'doctor_id' | 'location' | 'prep_notes'>> & { recurrence?: RecurrenceRule };

export const api = {
  health: () => request<{ status: string; db: string; timezone: string }>('/health'),

  getPeople: () => request<Person[]>('/people'),
  createPerson: (data: NewPerson) => request<Person>('/people', { method: 'POST', body: JSON.stringify(data) }),
  updatePerson: (id: number, data: Partial<NewPerson>) =>
    request<Person>(`/people/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePerson: (id: number) => request<void>(`/people/${id}`, { method: 'DELETE' }),

  getMedications: (personId: number) => request<Medication[]>(`/medications?person_id=${personId}`),
  createMedication: (data: NewMedication) =>
    request<Medication>('/medications', { method: 'POST', body: JSON.stringify(data) }),
  updateMedication: (id: number, data: Partial<NewMedication>) =>
    request<Medication>(`/medications/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMedication: (id: number) => request<void>(`/medications/${id}`, { method: 'DELETE' }),

  getDoctors: (personId: number) => request<Doctor[]>(`/doctors?person_id=${personId}`),
  createDoctor: (data: NewDoctor) => request<Doctor>('/doctors', { method: 'POST', body: JSON.stringify(data) }),
  updateDoctor: (id: number, data: Partial<NewDoctor>) =>
    request<Doctor>(`/doctors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDoctor: (id: number) => request<void>(`/doctors/${id}`, { method: 'DELETE' }),

  getAppointments: (personId: number) => request<Appointment[]>(`/appointments?person_id=${personId}`),
  createAppointment: (data: NewAppointment) =>
    request<Appointment>('/appointments', { method: 'POST', body: JSON.stringify(data) }),
  updateAppointment: (id: number, data: Partial<NewAppointment>) =>
    request<Appointment>(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAppointment: (id: number, scope?: 'future') =>
    request<void>(`/appointments/${id}${scope ? `?scope=${scope}` : ''}`, { method: 'DELETE' }),
  confirmAppointment: (id: number) => request<Appointment>(`/appointments/${id}/confirm`, { method: 'PUT' }),

  getDoseHistory: (personId: number, from: string, to: string) =>
    request<DoseHistoryEntry[]>(`/people/${personId}/doses?from=${from}&to=${to}`),

  getActions: (personId: number) => request<Action[]>(`/actions?person_id=${personId}`),
  createAction: (data: NewAction) => request<Action>('/actions', { method: 'POST', body: JSON.stringify(data) }),
  updateAction: (id: number, data: Partial<NewAction>) =>
    request<Action>(`/actions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAction: (id: number) => request<void>(`/actions/${id}`, { method: 'DELETE' }),

  getDocuments: (personId: number) => request<MedicalDocument[]>(`/documents?person_id=${personId}`),
  uploadDocument: (formData: FormData) => requestFormData<MedicalDocument>('/documents', formData),
  updateDocument: (id: number, data: Partial<Pick<MedicalDocument, 'title' | 'category' | 'notes'>>) =>
    request<MedicalDocument>(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDocument: (id: number) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
  getDocumentFileUrl: async (id: number) => `${await getBaseUrl()}/api/documents/${id}/file`,

  getPersonExportUrl: async (id: number) => `${await getBaseUrl()}/api/people/${id}/export`,
  importPerson: (formData: FormData) => requestFormData<Person>('/people/import', formData),
  getBackupExportUrl: async () => `${await getBaseUrl()}/api/backup/export`,
  importBackup: (formData: FormData) =>
    requestFormData<{ restored: Record<string, number> }>('/backup/import', formData),
};
