const UNITS = ['week', 'month', 'year'];
const MAX_INTERVAL = 12;
const MAX_COUNT = 52;

function isValidRecurrence(rule) {
  if (!rule || typeof rule !== 'object') return false;
  const { unit, interval, count } = rule;
  if (!UNITS.includes(unit)) return false;
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) return false;
  if (!Number.isInteger(count) || count < 2 || count > MAX_COUNT) return false;
  return true;
}

// Adds `interval` of `unit` to `date`, clamping to the last day of the
// target month when the original day-of-month doesn't exist there
// (e.g. Jan 31 + 1 month -> Feb 28, not Mar 3).
function addInterval(date, unit, interval) {
  const d = new Date(date.getTime());
  if (unit === 'week') {
    d.setUTCDate(d.getUTCDate() + 7 * interval);
    return d;
  }
  const day = d.getUTCDate();
  if (unit === 'month') {
    d.setUTCMonth(d.getUTCMonth() + interval);
  } else {
    d.setUTCFullYear(d.getUTCFullYear() + interval);
  }
  if (d.getUTCDate() !== day) {
    d.setUTCDate(0);
  }
  return d;
}

// Returns `rule.count` ISO datetime strings starting at startIso (inclusive).
function expandRecurrence(startIso, rule) {
  const dates = [];
  let current = new Date(startIso);
  for (let i = 0; i < rule.count; i++) {
    if (i > 0) current = addInterval(current, rule.unit, rule.interval);
    dates.push(current.toISOString());
  }
  return dates;
}

module.exports = { isValidRecurrence, expandRecurrence, UNITS, MAX_INTERVAL, MAX_COUNT };
