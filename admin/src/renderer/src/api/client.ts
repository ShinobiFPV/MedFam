import type { Appointment, Doctor, DoseHistoryEntry, Medication, Person } from '../types';

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

type NewPerson = Pick<Person, 'name'> & Partial<Pick<Person, 'date_of_birth' | 'notes'>>;
type NewMedication = Pick<Medication, 'person_id' | 'name' | 'schedule_json'> &
  Partial<Pick<Medication, 'dosage' | 'color' | 'description' | 'active'>>;
type NewDoctor = Pick<Doctor, 'person_id' | 'name'> & Partial<Pick<Doctor, 'specialty' | 'phone' | 'address' | 'notes'>>;
type NewAppointment = Pick<Appointment, 'person_id' | 'datetime_utc'> &
  Partial<Pick<Appointment, 'doctor_id' | 'location' | 'prep_notes'>>;

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
  deleteAppointment: (id: number) => request<void>(`/appointments/${id}`, { method: 'DELETE' }),
  confirmAppointment: (id: number) => request<Appointment>(`/appointments/${id}/confirm`, { method: 'PUT' }),

  getDoseHistory: (personId: number, from: string, to: string) =>
    request<DoseHistoryEntry[]>(`/people/${personId}/doses?from=${from}&to=${to}`),
};
