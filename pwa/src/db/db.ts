import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Appointment, Doctor, TodayResponse } from '../types';

export type ActionType = 'taken' | 'untaken' | 'confirm' | 'action-done' | 'action-undone';

export interface QueuedAction {
  id?: number;
  type: ActionType;
  // dose_event_id (uuid) for taken/untaken, appointment id (stringified) for
  // confirm, action_event_id (uuid) for action-done/action-undone
  targetId: string;
  takenAt?: string;
  createdAt: string;
}

export interface TodayCacheEntry {
  personId: number;
  response: TodayResponse;
  cachedAt: string;
}

export interface DoctorsCacheEntry {
  personId: number;
  doctors: Doctor[];
  cachedAt: string;
}

export interface AppointmentsCacheEntry {
  personId: number;
  appointments: Appointment[];
  cachedAt: string;
}

interface MedFamDB extends DBSchema {
  actionQueue: {
    key: number;
    value: QueuedAction;
  };
  todayCache: {
    key: number;
    value: TodayCacheEntry;
  };
  doctorsCache: {
    key: number;
    value: DoctorsCacheEntry;
  };
  appointmentsCache: {
    key: number;
    value: AppointmentsCacheEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<MedFamDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<MedFamDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MedFamDB>('medfam', 1, {
      upgrade(db) {
        db.createObjectStore('actionQueue', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('todayCache', { keyPath: 'personId' });
        db.createObjectStore('doctorsCache', { keyPath: 'personId' });
        db.createObjectStore('appointmentsCache', { keyPath: 'personId' });
      },
    });
  }
  return dbPromise;
}

// Test-only: closes the current connection and forces a fresh one next call.
// Must close before deleting the underlying fake-indexeddb database in
// beforeEach, or a lingering open connection blocks deleteDatabase forever.
export async function _resetDbForTests() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}
