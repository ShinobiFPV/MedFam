import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../api/client';
import { _resetDbForTests } from './db';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    api: {
      markTaken: vi.fn(),
      markUntaken: vi.fn(),
      confirmAppointment: vi.fn(),
      markActionDone: vi.fn(),
      markActionUndone: vi.fn(),
    },
  };
});

const { api } = await import('../api/client');
const {
  enqueueAction,
  getQueue,
  replayQueue,
  applyQueueToToday,
  applyQueueToAppointments,
  setDoseTaken,
  setActionDone,
  setAppointmentConfirmed,
} = await import('./queue');

function networkError() {
  // fetch() rejects with a TypeError for actual network failures.
  return new TypeError('Failed to fetch');
}

async function resetDb() {
  await _resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('medfam');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb();
});

describe('offline action queue', () => {
  test('actions enqueued while offline stay queued until replay succeeds', async () => {
    vi.mocked(api.markTaken).mockRejectedValue(networkError());

    await enqueueAction({ type: 'taken', targetId: 'dose-1', takenAt: 't1', createdAt: 't1' });

    const result = await replayQueue();

    expect(result.stoppedEarly).toBe(true);
    expect(result.flushedIds).toHaveLength(0);
    expect(await getQueue()).toHaveLength(1);
  });

  test('replays queued actions in FIFO order', async () => {
    const callOrder: string[] = [];
    vi.mocked(api.markTaken).mockImplementation(async (id) => {
      callOrder.push(`taken:${id}`);
      return {} as never;
    });
    vi.mocked(api.markUntaken).mockImplementation(async (id) => {
      callOrder.push(`untaken:${id}`);
      return {} as never;
    });

    await enqueueAction({ type: 'taken', targetId: 'dose-1', takenAt: 't1', createdAt: 't1' });
    await enqueueAction({ type: 'taken', targetId: 'dose-2', takenAt: 't2', createdAt: 't2' });
    await enqueueAction({ type: 'untaken', targetId: 'dose-1', createdAt: 't3' });

    const result = await replayQueue();

    expect(callOrder).toEqual(['taken:dose-1', 'taken:dose-2', 'untaken:dose-1']);
    expect(result.stoppedEarly).toBe(false);
    expect(await getQueue()).toHaveLength(0);
  });

  test('a transient failure halts replay, leaving later actions queued for the next attempt', async () => {
    vi.mocked(api.markTaken).mockImplementation(async (id) => {
      if (id === 'dose-1') return {} as never;
      throw networkError();
    });

    await enqueueAction({ type: 'taken', targetId: 'dose-1', takenAt: 't1', createdAt: 't1' });
    await enqueueAction({ type: 'taken', targetId: 'dose-2', takenAt: 't2', createdAt: 't2' });

    const firstAttempt = await replayQueue();
    expect(firstAttempt.stoppedEarly).toBe(true);
    expect(firstAttempt.flushedIds).toHaveLength(1);

    const remaining = await getQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].targetId).toBe('dose-2');

    // Connectivity returns: retrying replays only what's left, and doesn't
    // re-call the endpoint for the already-flushed dose-1 action.
    vi.mocked(api.markTaken).mockResolvedValue({} as never);
    const secondAttempt = await replayQueue();

    expect(secondAttempt.stoppedEarly).toBe(false);
    expect(secondAttempt.flushedIds).toHaveLength(1);
    expect(vi.mocked(api.markTaken)).toHaveBeenCalledTimes(3); // dose-1, dose-2 (fail), dose-2 (retry)
    expect(await getQueue()).toHaveLength(0);
  });

  test('drops a non-retryable 4xx action instead of jamming the queue', async () => {
    vi.mocked(api.markUntaken).mockRejectedValue(new ApiError(404, 'Dose event not found'));
    vi.mocked(api.markTaken).mockResolvedValue({} as never);

    await enqueueAction({ type: 'untaken', targetId: 'missing-dose', createdAt: 't1' });
    await enqueueAction({ type: 'taken', targetId: 'dose-2', takenAt: 't2', createdAt: 't2' });

    const result = await replayQueue();

    expect(result.stoppedEarly).toBe(false);
    expect(result.droppedIds).toHaveLength(1);
    expect(result.flushedIds).toHaveLength(1);
    expect(await getQueue()).toHaveLength(0);
  });
});

describe('applyQueueToToday overlay', () => {
  const baseToday = {
    date: '2026-07-14',
    doses: [
      {
        dose_event_id: 'dose-1',
        medication_id: 1,
        name: 'Lisinopril',
        dosage: '10mg',
        color: '#4C6EF5',
        description: 'desc',
        scheduled_time: '08:00',
        taken: false,
        taken_at: null,
      },
    ],
    actions: [
      {
        action_event_id: 'action-1',
        action_id: 1,
        name: 'Ankle stretches',
        category: 'Physio',
        notes: 'notes',
        scheduled_time: '09:00',
        done: false,
        done_at: null,
      },
    ],
    appointments_today: [],
    appointments_upcoming: [
      {
        id: 1,
        person_id: 1,
        doctor_id: 1,
        datetime_utc: '2026-07-20T14:00:00.000Z',
        location: 'Clinic',
        prep_notes: null,
        confirmed_at: null,
        created_at: '2026-07-01 00:00:00',
      },
    ],
  };

  test('overlays a pending taken action onto the matching dose without mutating the source', () => {
    const queue = [{ id: 1, type: 'taken' as const, targetId: 'dose-1', takenAt: 'x', createdAt: 'x' }];
    const result = applyQueueToToday(baseToday, queue);

    expect(result.doses[0].taken).toBe(true);
    expect(result.doses[0].taken_at).toBe('x');
    expect(baseToday.doses[0].taken).toBe(false); // original untouched
  });

  test('the most recently queued action for a target wins', () => {
    const queue = [
      { id: 1, type: 'taken' as const, targetId: 'dose-1', takenAt: 'x', createdAt: 'x' },
      { id: 2, type: 'untaken' as const, targetId: 'dose-1', createdAt: 'y' },
    ];
    const result = applyQueueToToday(baseToday, queue);
    expect(result.doses[0].taken).toBe(false);
  });

  test('overlays a pending confirm action onto the matching appointment', () => {
    const queue = [{ id: 1, type: 'confirm' as const, targetId: '1', createdAt: 'z' }];
    const result = applyQueueToAppointments(baseToday.appointments_upcoming, queue);
    expect(result[0].confirmed_at).toBe('z');
  });

  test('overlays a pending action-done action onto the matching action without mutating the source', () => {
    const queue = [{ id: 1, type: 'action-done' as const, targetId: 'action-1', takenAt: 'x', createdAt: 'x' }];
    const result = applyQueueToToday(baseToday, queue);

    expect(result.actions[0].done).toBe(true);
    expect(result.actions[0].done_at).toBe('x');
    expect(baseToday.actions[0].done).toBe(false); // original untouched
  });

  test('the most recently queued action-done/action-undone for a target wins', () => {
    const queue = [
      { id: 1, type: 'action-done' as const, targetId: 'action-1', takenAt: 'x', createdAt: 'x' },
      { id: 2, type: 'action-undone' as const, targetId: 'action-1', createdAt: 'y' },
    ];
    const result = applyQueueToToday(baseToday, queue);
    expect(result.actions[0].done).toBe(false);
  });
});

describe('direct local mutations (survive a flush that outruns the next render)', () => {
  const baseToday = {
    date: '2026-07-14',
    doses: [
      {
        dose_event_id: 'dose-1',
        medication_id: 1,
        name: 'Lisinopril',
        dosage: '10mg',
        color: '#4C6EF5',
        description: 'desc',
        scheduled_time: '08:00',
        taken: false,
        taken_at: null,
      },
    ],
    actions: [
      {
        action_event_id: 'action-1',
        action_id: 1,
        name: 'Ankle stretches',
        category: 'Physio',
        notes: 'notes',
        scheduled_time: '09:00',
        done: false,
        done_at: null,
      },
    ],
    appointments_today: [],
    appointments_upcoming: [],
  };

  test('setDoseTaken marks the target dose without an empty queue erasing it', () => {
    const mutated = setDoseTaken(baseToday, 'dose-1', true, 'x');
    // Simulates the queue having already flushed and emptied by the next render.
    const rendered = applyQueueToToday(mutated, []);
    expect(rendered.doses[0].taken).toBe(true);
    expect(rendered.doses[0].taken_at).toBe('x');
  });

  test('setDoseTaken back to untaken clears taken_at', () => {
    const taken = setDoseTaken(baseToday, 'dose-1', true, 'x');
    const untaken = setDoseTaken(taken, 'dose-1', false, null);
    expect(untaken.doses[0].taken).toBe(false);
    expect(untaken.doses[0].taken_at).toBeNull();
  });

  test('setActionDone marks the target action without an empty queue erasing it', () => {
    const mutated = setActionDone(baseToday, 'action-1', true, 'x');
    const rendered = applyQueueToToday(mutated, []);
    expect(rendered.actions[0].done).toBe(true);
    expect(rendered.actions[0].done_at).toBe('x');
  });

  test('setActionDone back to not-done clears done_at', () => {
    const done = setActionDone(baseToday, 'action-1', true, 'x');
    const undone = setActionDone(done, 'action-1', false, null);
    expect(undone.actions[0].done).toBe(false);
    expect(undone.actions[0].done_at).toBeNull();
  });

  test('setAppointmentConfirmed marks the target appointment without an empty queue erasing it', () => {
    const appointments = [
      {
        id: 1,
        person_id: 1,
        doctor_id: 1,
        datetime_utc: '2026-07-20T14:00:00.000Z',
        location: 'Clinic',
        prep_notes: null,
        confirmed_at: null,
        created_at: '2026-07-01 00:00:00',
      },
    ];
    const mutated = setAppointmentConfirmed(appointments, 1, 'z');
    const rendered = applyQueueToAppointments(mutated, []);
    expect(rendered[0].confirmed_at).toBe('z');
  });
});
