import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { readAppointmentsCache, writeAppointmentsCache } from '../db/cache';
import { useQueue } from '../context/QueueContext';
import { applyQueueToAppointments, setAppointmentConfirmed } from '../db/queue';
import type { Appointment } from '../types';

const LIMIT = 20;

interface LocalOverride {
  confirmedAt: string;
  mutatedAt: number;
}

export function useAppointments(personId: number | null) {
  const [rawAppointments, setRawAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const { queue, enqueue } = useQueue();
  const personIdRef = useRef(personId);
  personIdRef.current = personId;

  // See the matching comment in useToday.ts: a fetch in flight when a tap
  // happens can otherwise resolve after (and clobber) the optimistic
  // confirm with stale pre-tap data.
  const localOverridesRef = useRef<Map<number, LocalOverride>>(new Map());

  const load = useCallback(async (id: number) => {
    const requestStartedAt = Date.now();
    setLoading(true);
    const cached = await readAppointmentsCache(id);
    if (cached) setRawAppointments(cached.appointments);

    try {
      const fresh = await api.getUpcomingAppointments(id, LIMIT);
      const merged = fresh.map((appt) => {
        const override = localOverridesRef.current.get(appt.id);
        if (!override) return appt;
        if (override.mutatedAt > requestStartedAt) {
          return { ...appt, confirmed_at: override.confirmedAt };
        }
        localOverridesRef.current.delete(appt.id);
        return appt;
      });
      setRawAppointments(merged);
      writeAppointmentsCache(id, merged);
    } catch {
      // Offline: keep whatever cache we already loaded above.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (personId == null) return;
    load(personId);
  }, [personId, load]);

  const confirm = useCallback(
    async (appointmentId: number) => {
      const timestamp = new Date().toISOString();

      localOverridesRef.current.set(appointmentId, { confirmedAt: timestamp, mutatedAt: Date.now() });

      // Applied directly (not just via the queue overlay) so a fast flush
      // dequeuing the action doesn't flash "Confirmed" and then revert it —
      // see the matching comment in useToday's toggleDose.
      setRawAppointments((prev) => {
        const updated = setAppointmentConfirmed(prev, appointmentId, timestamp);
        if (personIdRef.current != null) writeAppointmentsCache(personIdRef.current, updated);
        return updated;
      });

      await enqueue({ type: 'confirm', targetId: String(appointmentId), createdAt: timestamp });
    },
    [enqueue]
  );

  const appointments = applyQueueToAppointments(rawAppointments, queue);
  const refresh = useCallback(() => (personId != null ? load(personId) : Promise.resolve()), [personId, load]);

  return { appointments, loading, confirm, refresh };
}
