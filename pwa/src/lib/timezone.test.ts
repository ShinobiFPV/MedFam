import { afterEach, describe, expect, test } from 'vitest';
import { getTimeZone, isCacheStale, setTimeZone, torontoDateString } from './timezone';

describe('isCacheStale (midnight-rollover detection)', () => {
  test('is false when the cached date matches the current Toronto date', () => {
    const now = new Date('2026-07-14T15:00:00Z'); // 11:00 EDT
    const cachedDate = torontoDateString(now);
    expect(isCacheStale(cachedDate, now)).toBe(false);
  });

  test('is false when the UTC date has rolled over but the Toronto date has not', () => {
    // 10:00 PM EDT on July 14 is already July 15 in UTC — a naive UTC-date
    // comparison would (wrongly) call this stale.
    const stillEveningInToronto = new Date('2026-07-15T02:00:00Z');
    expect(isCacheStale('2026-07-14', stillEveningInToronto)).toBe(false);
  });

  test('is true once the Toronto date has actually rolled over past midnight', () => {
    const afterMidnightInToronto = new Date('2026-07-15T05:00:00Z'); // 1:00 AM EDT July 15
    expect(isCacheStale('2026-07-14', afterMidnightInToronto)).toBe(true);
  });

  test('is false when there is no cached date yet', () => {
    expect(isCacheStale(undefined, new Date())).toBe(false);
  });
});

describe('setTimeZone', () => {
  const DEFAULT_TZ = 'America/Toronto';

  afterEach(() => {
    setTimeZone(DEFAULT_TZ); // don't leak the override into other tests
  });

  test('changes the zone every date function uses', () => {
    // 11:00 PM Pacific on July 14 is already July 15 in Eastern time —
    // the two zones must disagree on "today" for this to be a real test.
    const instant = new Date('2026-07-15T06:00:00Z');

    setTimeZone(DEFAULT_TZ);
    const easternDate = torontoDateString(instant);

    setTimeZone('America/Los_Angeles');
    const pacificDate = torontoDateString(instant);

    expect(getTimeZone()).toBe('America/Los_Angeles');
    expect(pacificDate).not.toBe(easternDate);
    expect(pacificDate).toBe('2026-07-14');
    expect(easternDate).toBe('2026-07-15');
  });

  test('isCacheStale respects the currently-set zone', () => {
    const instant = new Date('2026-07-15T06:00:00Z');
    setTimeZone('America/Los_Angeles');
    // Still July 14 in Pacific time, so a cache dated July 14 is not stale.
    expect(isCacheStale('2026-07-14', instant)).toBe(false);
  });
});
