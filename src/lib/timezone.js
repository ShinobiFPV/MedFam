const { TIME_ZONE } = require('./config');

const DAY_ABBREVS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// en-CA formats as YYYY-MM-DD, which matches the scheduled_date column format.
function torontoDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function torontoDayAbbrev(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
  }).format(date);
  return weekday.toLowerCase().slice(0, 3);
}

module.exports = { TIME_ZONE, DAY_ABBREVS, torontoDateString, torontoDayAbbrev };
