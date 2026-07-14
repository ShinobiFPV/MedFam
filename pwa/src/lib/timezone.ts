// Fallback until setTimeZone() is called with the server's configured value
// (see PersonContext.tsx) — keeps a fresh, offline, first-ever load working
// exactly as before rather than crashing or showing "no date."
let TIME_ZONE = 'America/Toronto';

export function setTimeZone(tz: string): void {
  TIME_ZONE = tz;
}

export function getTimeZone(): string {
  return TIME_ZONE;
}

export function torontoDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// True once the wall-clock date in Toronto has moved past the date a cached
// /today response was generated for — the midnight-rollover case.
export function isCacheStale(cachedDate: string | undefined, now: Date = new Date()): boolean {
  if (!cachedDate) return false;
  return torontoDateString(now) !== cachedDate;
}

export function formatLongDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatScheduledTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatApptDateTime(isoUtc: string): { date: string; time: string } {
  const d = new Date(isoUtc);
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return { date, time };
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function timeOfDayBucket(hhmm: string): TimeOfDay {
  const [h] = hhmm.split(':').map(Number);
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
