import type { ActionEventRow, Appointment, Doctor, DoseEventRow, Person, TodayResponse } from '../types';

const BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
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

export const api = {
  health: () => request<{ status: string; db: string; timezone: string }>('/health'),
  getPeople: () => request<Person[]>('/people'),
  getToday: (personId: number) => request<TodayResponse>(`/people/${personId}/today`),
  getDoctors: (personId: number) => request<Doctor[]>(`/doctors?person_id=${personId}`),
  getUpcomingAppointments: (personId: number, limit = 10) =>
    request<Appointment[]>(`/people/${personId}/appointments/upcoming?limit=${limit}`),
  markTaken: (doseEventId: string, takenAt?: string) =>
    request<DoseEventRow>(`/dose-events/${doseEventId}/taken`, {
      method: 'PUT',
      body: JSON.stringify(takenAt ? { taken_at: takenAt } : {}),
    }),
  markUntaken: (doseEventId: string) =>
    request<DoseEventRow>(`/dose-events/${doseEventId}/untaken`, { method: 'PUT' }),
  confirmAppointment: (appointmentId: number) =>
    request<Appointment>(`/appointments/${appointmentId}/confirm`, { method: 'PUT' }),
  markActionDone: (actionEventId: string, doneAt?: string) =>
    request<ActionEventRow>(`/action-events/${actionEventId}/done`, {
      method: 'PUT',
      body: JSON.stringify(doneAt ? { done_at: doneAt } : {}),
    }),
  markActionUndone: (actionEventId: string) =>
    request<ActionEventRow>(`/action-events/${actionEventId}/undone`, { method: 'PUT' }),
};
