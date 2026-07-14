import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { enqueueAction, getQueue, replayQueue } from '../db/queue';
import type { QueuedAction } from '../db/db';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface QueueContextValue {
  queue: QueuedAction[];
  enqueue: (action: Omit<QueuedAction, 'id'>) => Promise<void>;
  flush: () => Promise<void>;
}

const QueueContext = createContext<QueueContextValue | undefined>(undefined);

// Retry cadence for connectivity that flaps without ever firing a browser
// online/offline event (flaky Wi-Fi, captive portals, etc.).
const RETRY_INTERVAL_MS = 30_000;

export function QueueProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const online = useOnlineStatus();
  const flushingRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    setQueue(await getQueue());
  }, []);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      await replayQueue();
    } finally {
      flushingRef.current = false;
      await refreshQueue();
    }
  }, [refreshQueue]);

  useEffect(() => {
    if (online) flush();
  }, [online, flush]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) flush();
    }, RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [flush]);

  const enqueue = useCallback(
    async (action: Omit<QueuedAction, 'id'>) => {
      await enqueueAction(action);
      await refreshQueue();
      if (navigator.onLine) flush();
    },
    [refreshQueue, flush]
  );

  const value = useMemo(() => ({ queue, enqueue, flush }), [queue, enqueue, flush]);

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useQueue() {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error('useQueue must be used within a QueueProvider');
  return ctx;
}
