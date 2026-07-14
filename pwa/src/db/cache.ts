import { getDb } from './db';
import type { Appointment, Doctor, TodayResponse } from '../types';

export async function readTodayCache(personId: number) {
  const db = await getDb();
  return db.get('todayCache', personId);
}

export async function writeTodayCache(personId: number, response: TodayResponse) {
  const db = await getDb();
  await db.put('todayCache', { personId, response, cachedAt: new Date().toISOString() });
}

export async function readDoctorsCache(personId: number) {
  const db = await getDb();
  return db.get('doctorsCache', personId);
}

export async function writeDoctorsCache(personId: number, doctors: Doctor[]) {
  const db = await getDb();
  await db.put('doctorsCache', { personId, doctors, cachedAt: new Date().toISOString() });
}

export async function readAppointmentsCache(personId: number) {
  const db = await getDb();
  return db.get('appointmentsCache', personId);
}

export async function writeAppointmentsCache(personId: number, appointments: Appointment[]) {
  const db = await getDb();
  await db.put('appointmentsCache', { personId, appointments, cachedAt: new Date().toISOString() });
}
