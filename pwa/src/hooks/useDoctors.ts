import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { readDoctorsCache, writeDoctorsCache } from '../db/cache';
import type { Doctor } from '../types';

export function useDoctors(personId: number | null): Doctor[] {
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  useEffect(() => {
    if (personId == null) return;
    let cancelled = false;

    readDoctorsCache(personId).then((cached) => {
      if (!cancelled && cached) setDoctors(cached.doctors);
    });

    api
      .getDoctors(personId)
      .then((list) => {
        if (cancelled) return;
        setDoctors(list);
        writeDoctorsCache(personId, list);
      })
      .catch(() => {
        // Offline: keep whatever cached list we already loaded above.
      });

    return () => {
      cancelled = true;
    };
  }, [personId]);

  return doctors;
}
