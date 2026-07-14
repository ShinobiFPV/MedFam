const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function parseSchedule(scheduleJson) {
  return typeof scheduleJson === 'string' ? JSON.parse(scheduleJson) : scheduleJson;
}

function isValidSchedule(schedule) {
  if (!schedule || !Array.isArray(schedule.times) || schedule.times.length === 0) return false;
  if (schedule.days === 'daily') return true;
  return Array.isArray(schedule.days) && schedule.days.length > 0 && schedule.days.every((d) => VALID_DAYS.includes(d));
}

function scheduleAppliesToday(scheduleJson, dayAbbrev) {
  const schedule = parseSchedule(scheduleJson);
  if (schedule.days === 'daily') return true;
  if (Array.isArray(schedule.days)) return schedule.days.includes(dayAbbrev);
  return false;
}

function scheduleTimes(scheduleJson) {
  const schedule = parseSchedule(scheduleJson);
  return Array.isArray(schedule.times) ? schedule.times : [];
}

module.exports = { VALID_DAYS, parseSchedule, isValidSchedule, scheduleAppliesToday, scheduleTimes };
