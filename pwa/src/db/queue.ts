import { getDb } from './db';
import type { QueuedAction } from './db';
import { api, ApiError } from '../api/client';
import type { Appointment, TodayResponse } from '../types';

export async function enqueueAction(action: Omit<QueuedAction, 'id'>): Promise<QueuedAction> {
  const db = await getDb();
  const id = await db.add('actionQueue', action as QueuedAction);
  return { ...action, id };
}

export async function getQueue(): Promise<QueuedAction[]> {
  const db = await getDb();
  const all = await db.getAll('actionQueue');
  return all.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

export async function removeFromQueue(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('actionQueue', id);
}

export interface FlushResult {
  flushedIds: number[];
  droppedIds: number[];
  stoppedEarly: boolean;
}

function isDropworthy(err: unknown): boolean {
  // A definite 4xx reply means the target is gone or the request is invalid —
  // retrying forever would jam the queue. Network failures and 5xx are
  // transient, so those are left in place for the next flush attempt.
  return err instanceof ApiError && err.status >= 400 && err.status < 500;
}

async function applyAction(action: QueuedAction): Promise<void> {
  switch (action.type) {
    case 'taken':
      await api.markTaken(action.targetId, action.takenAt);
      return;
    case 'untaken':
      await api.markUntaken(action.targetId);
      return;
    case 'confirm':
      await api.confirmAppointment(Number(action.targetId));
      return;
    case 'action-done':
      await api.markActionDone(action.targetId, action.takenAt);
      return;
    case 'action-undone':
      await api.markActionUndone(action.targetId);
      return;
  }
}

// Replays queued actions in FIFO order via the idempotent endpoints. Stops at
// the first transient failure so later actions stay queued in their original
// order (correctness of replay order matters more than best-effort throughput
// here — e.g. a stale "untaken" must not apply before its "taken").
export async function replayQueue(queue?: QueuedAction[]): Promise<FlushResult> {
  const items = queue ?? (await getQueue());
  const flushedIds: number[] = [];
  const droppedIds: number[] = [];

  for (const action of items) {
    if (action.id === undefined) continue;
    try {
      await applyAction(action);
      await removeFromQueue(action.id);
      flushedIds.push(action.id);
    } catch (err) {
      if (isDropworthy(err)) {
        await removeFromQueue(action.id);
        droppedIds.push(action.id);
        continue;
      }
      return { flushedIds, droppedIds, stoppedEarly: true };
    }
  }
  return { flushedIds, droppedIds, stoppedEarly: false };
}

// Overlays not-yet-flushed queue actions onto a today/appointments payload so
// the UI reflects taps immediately, even across a reload before the queue
// drains. Last queued action for a given target wins.
export function applyQueueToToday(today: TodayResponse, queue: QueuedAction[]): TodayResponse {
  if (queue.length === 0) return today;

  const doses = today.doses.map((dose) => {
    const relevant = queue.filter(
      (a) => (a.type === 'taken' || a.type === 'untaken') && a.targetId === dose.dose_event_id
    );
    if (relevant.length === 0) return dose;
    const last = relevant[relevant.length - 1];
    if (last.type === 'taken') {
      return { ...dose, taken: true, taken_at: last.takenAt ?? last.createdAt };
    }
    return { ...dose, taken: false, taken_at: null };
  });

  const actions = today.actions.map((action) => {
    const relevant = queue.filter(
      (a) => (a.type === 'action-done' || a.type === 'action-undone') && a.targetId === action.action_event_id
    );
    if (relevant.length === 0) return action;
    const last = relevant[relevant.length - 1];
    if (last.type === 'action-done') {
      return { ...action, done: true, done_at: last.takenAt ?? last.createdAt };
    }
    return { ...action, done: false, done_at: null };
  });

  return {
    ...today,
    doses,
    actions,
    appointments_today: applyQueueToAppointments(today.appointments_today, queue),
    appointments_upcoming: applyQueueToAppointments(today.appointments_upcoming, queue),
  };
}

export function applyQueueToAppointments(appointments: Appointment[], queue: QueuedAction[]): Appointment[] {
  if (queue.length === 0) return appointments;
  return appointments.map((appt) => {
    const relevant = queue.filter((a) => a.type === 'confirm' && a.targetId === String(appt.id));
    if (relevant.length === 0) return appt;
    const last = relevant[relevant.length - 1];
    return { ...appt, confirmed_at: appt.confirmed_at ?? last.createdAt };
  });
}

// Direct, permanent local mutations (as opposed to the queue overlay above,
// which only reflects *pending* actions). These matter because a flush can
// complete in milliseconds on a good connection: the instant an action is
// dequeued, applyQueueTo* stops covering for it, and without also updating
// the underlying cached snapshot the UI would flash the change and then
// revert to whatever was last fetched, until the next /today revalidation.
// Callers apply these immediately on tap, then still enqueue the action for
// durability (offline queueing, replay after a reload, etc).
export function setDoseTaken(
  today: TodayResponse,
  doseEventId: string,
  taken: boolean,
  takenAt: string | null
): TodayResponse {
  return {
    ...today,
    doses: today.doses.map((dose) => (dose.dose_event_id === doseEventId ? { ...dose, taken, taken_at: takenAt } : dose)),
  };
}

export function setActionDone(
  today: TodayResponse,
  actionEventId: string,
  done: boolean,
  doneAt: string | null
): TodayResponse {
  return {
    ...today,
    actions: today.actions.map((action) =>
      action.action_event_id === actionEventId ? { ...action, done, done_at: doneAt } : action
    ),
  };
}

export function setAppointmentConfirmed(
  appointments: Appointment[],
  appointmentId: number,
  confirmedAt: string
): Appointment[] {
  return appointments.map((appt) =>
    appt.id === appointmentId ? { ...appt, confirmed_at: appt.confirmed_at ?? confirmedAt } : appt
  );
}
