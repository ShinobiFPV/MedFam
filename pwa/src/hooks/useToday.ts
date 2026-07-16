import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { readTodayCache, writeTodayCache } from '../db/cache';
import { applyQueueToToday, setActionDone, setDoseTaken } from '../db/queue';
import { useQueue } from '../context/QueueContext';
import { isCacheStale } from '../lib/timezone';
import type { TodayResponse } from '../types';

const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;
const ROLLOVER_CHECK_INTERVAL_MS = 60 * 1000;

interface UseTodayResult {
  today: TodayResponse | null;
  loading: boolean;
  isFromCache: boolean;
  toggleDose: (doseEventId: string, nextTaken: boolean) => Promise<void>;
  toggleAction: (actionEventId: string, nextDone: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

interface LocalOverride {
  taken: boolean;
  takenAt: string | null;
  mutatedAt: number;
}

export function useToday(personId: number | null): UseTodayResult {
  const [rawToday, setRawToday] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const { queue, enqueue } = useQueue();
  const personIdRef = useRef(personId);
  personIdRef.current = personId;

  // A /today GET can be in flight when a tap happens (e.g. a revalidation
  // triggered by a focus/visibility event right before the tap) and resolve
  // *after* our optimistic mutation lands, with data from before it — a
  // plain `setRawToday(response)` would silently clobber the tap. Each
  // mutation is recorded here with a timestamp; a fetch only trusts its own
  // value for a dose if the fetch started after that dose's last local
  // mutation, otherwise it keeps the local value until a fetch that's
  // actually newer confirms it.
  const localOverridesRef = useRef<Map<string, LocalOverride>>(new Map());
  // Same purpose as localOverridesRef above, kept separate since action_event_id
  // and dose_event_id are independent uuid spaces.
  const actionOverridesRef = useRef<Map<string, LocalOverride>>(new Map());

  const fetchFresh = useCallback(async (id: number) => {
    const requestStartedAt = Date.now();
    try {
      const response = await api.getToday(id);
      if (personIdRef.current !== id) return; // person switched mid-flight; drop this response

      const merged: TodayResponse = {
        ...response,
        doses: response.doses.map((dose) => {
          const override = localOverridesRef.current.get(dose.dose_event_id);
          if (!override) return dose;
          if (override.mutatedAt > requestStartedAt) {
            return { ...dose, taken: override.taken, taken_at: override.takenAt };
          }
          localOverridesRef.current.delete(dose.dose_event_id);
          return dose;
        }),
        actions: response.actions.map((action) => {
          const override = actionOverridesRef.current.get(action.action_event_id);
          if (!override) return action;
          if (override.mutatedAt > requestStartedAt) {
            return { ...action, done: override.taken, done_at: override.takenAt };
          }
          actionOverridesRef.current.delete(action.action_event_id);
          return action;
        }),
      };

      setRawToday(merged);
      setIsFromCache(false);
      writeTodayCache(id, merged);
    } catch {
      // Offline or Pi unreachable: keep whatever cache/state we already have.
    } finally {
      setLoading(false);
    }
  }, []);

  const loadForPerson = useCallback(
    async (id: number) => {
      setLoading(true);
      const cached = await readTodayCache(id);
      if (cached && !isCacheStale(cached.response.date)) {
        setRawToday(cached.response);
        setIsFromCache(true);
        setLoading(false);
      } else {
        // No cache, or cache is from before the Toronto midnight rollover —
        // never show yesterday's doses labeled as today's.
        setRawToday(null);
        setIsFromCache(false);
      }
      await fetchFresh(id);
    },
    [fetchFresh]
  );

  useEffect(() => {
    if (personId == null) return;
    loadForPerson(personId);
  }, [personId, loadForPerson]);

  const refresh = useCallback(async () => {
    if (personId == null) return;
    await fetchFresh(personId);
  }, [personId, fetchFresh]);

  useEffect(() => {
    if (personId == null) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    const interval = setInterval(refresh, REVALIDATE_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      clearInterval(interval);
    };
  }, [personId, refresh]);

  useEffect(() => {
    if (!rawToday) return;
    const check = setInterval(() => {
      if (isCacheStale(rawToday.date)) refresh();
    }, ROLLOVER_CHECK_INTERVAL_MS);
    return () => clearInterval(check);
  }, [rawToday, refresh]);

  const toggleDose = useCallback(
    async (doseEventId: string, nextTaken: boolean) => {
      const timestamp = new Date().toISOString();

      localOverridesRef.current.set(doseEventId, {
        taken: nextTaken,
        takenAt: nextTaken ? timestamp : null,
        mutatedAt: Date.now(),
      });

      // Apply the mutation to our own local snapshot immediately, rather
      // than relying solely on the queue overlay below: a flush can
      // complete in well under a second on a good connection, and once the
      // action is dequeued the overlay stops covering for it. Without this,
      // the checkmark would flash on and then revert to the last fetched
      // state until the next /today revalidation.
      setRawToday((prev) => {
        if (!prev) return prev;
        const updated = setDoseTaken(prev, doseEventId, nextTaken, nextTaken ? timestamp : null);
        if (personIdRef.current != null) writeTodayCache(personIdRef.current, updated);
        return updated;
      });

      await enqueue({
        type: nextTaken ? 'taken' : 'untaken',
        targetId: doseEventId,
        takenAt: nextTaken ? timestamp : undefined,
        createdAt: timestamp,
      });
    },
    [enqueue]
  );

  const toggleAction = useCallback(
    async (actionEventId: string, nextDone: boolean) => {
      const timestamp = new Date().toISOString();

      actionOverridesRef.current.set(actionEventId, {
        taken: nextDone,
        takenAt: nextDone ? timestamp : null,
        mutatedAt: Date.now(),
      });

      // See the matching comment in toggleDose above.
      setRawToday((prev) => {
        if (!prev) return prev;
        const updated = setActionDone(prev, actionEventId, nextDone, nextDone ? timestamp : null);
        if (personIdRef.current != null) writeTodayCache(personIdRef.current, updated);
        return updated;
      });

      await enqueue({
        type: nextDone ? 'action-done' : 'action-undone',
        targetId: actionEventId,
        takenAt: nextDone ? timestamp : undefined,
        createdAt: timestamp,
      });
    },
    [enqueue]
  );

  const today = rawToday ? applyQueueToToday(rawToday, queue) : null;

  return { today, loading, isFromCache, toggleDose, toggleAction, refresh };
}
