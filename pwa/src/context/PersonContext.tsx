import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api/client';
import { setTimeZone } from '../lib/timezone';
import type { Person } from '../types';

const PERSON_ID_KEY = 'medfam.personId';
const PEOPLE_CACHE_KEY = 'medfam.peopleCache';
const TIMEZONE_CACHE_KEY = 'medfam.timezone';

interface PersonContextValue {
  people: Person[];
  personId: number | null;
  person: Person | null;
  loading: boolean;
  selectPerson: (id: number) => void;
  clearPerson: () => void;
}

const PersonContext = createContext<PersonContextValue | undefined>(undefined);

function readCachedPeople(): Person[] {
  try {
    const raw = localStorage.getItem(PEOPLE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Person[]) : [];
  } catch {
    return [];
  }
}

function readStoredPersonId(): number | null {
  const raw = localStorage.getItem(PERSON_ID_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Applied once at module load (before the app's first render) so even a
// fresh-but-offline load uses the last-known-good timezone instead of always
// falling back to timezone.ts's hardcoded America/Toronto default.
const cachedTimezone = localStorage.getItem(TIMEZONE_CACHE_KEY);
if (cachedTimezone) setTimeZone(cachedTimezone);

export function PersonProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState<Person[]>(() => readCachedPeople());
  const [personId, setPersonId] = useState<number | null>(() => readStoredPersonId());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getPeople()
      .then((list) => {
        if (cancelled) return;
        setPeople(list);
        localStorage.setItem(PEOPLE_CACHE_KEY, JSON.stringify(list));
      })
      .catch(() => {
        // offline on first load: keep whatever cached list we already have
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Independent of the people-fetch effect above, so a /health failure never
  // blocks the person list (and vice versa).
  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((res) => {
        if (cancelled) return;
        setTimeZone(res.timezone);
        localStorage.setItem(TIMEZONE_CACHE_KEY, res.timezone);
      })
      .catch(() => {
        // offline: keep whatever cached/default timezone we already have
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectPerson = useCallback((id: number) => {
    localStorage.setItem(PERSON_ID_KEY, String(id));
    setPersonId(id);
  }, []);

  const clearPerson = useCallback(() => {
    localStorage.removeItem(PERSON_ID_KEY);
    setPersonId(null);
  }, []);

  const person = useMemo(() => people.find((p) => p.id === personId) ?? null, [people, personId]);

  const value = useMemo(
    () => ({ people, personId, person, loading, selectPerson, clearPerson }),
    [people, personId, person, loading, selectPerson, clearPerson]
  );

  return <PersonContext.Provider value={value}>{children}</PersonContext.Provider>;
}

export function usePerson() {
  const ctx = useContext(PersonContext);
  if (!ctx) throw new Error('usePerson must be used within a PersonProvider');
  return ctx;
}
