const DEFAULT_TIME_ZONE = 'America/Toronto';

function resolveTimeZone(raw) {
  const tz = raw && raw.trim() ? raw.trim() : DEFAULT_TIME_ZONE;
  try {
    // Throws RangeError on an invalid IANA zone name.
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new Error(
      `Invalid MEDFAM_TIMEZONE "${tz}". Must be a valid IANA timezone name, e.g. "America/Toronto". ` +
        'Run "timedatectl list-timezones" on Linux to see valid values.'
    );
  }
  return tz;
}

// Fails fast at startup (this throws at require() time) rather than silently
// falling back — a wrong timezone would silently corrupt every dose's
// "due today" computation, which is worse than the service refusing to start.
const TIME_ZONE = resolveTimeZone(process.env.MEDFAM_TIMEZONE);

module.exports = { TIME_ZONE };
