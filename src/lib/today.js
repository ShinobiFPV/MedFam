const crypto = require('crypto');
const { torontoDateString, torontoDayAbbrev } = require('./timezone');
const { scheduleAppliesToday, scheduleTimes } = require('./schedule');

// Lazily creates today's dose_events for a person's active medications.
// Safe to call repeatedly: the (medication_id, scheduled_date, scheduled_time)
// unique index plus INSERT OR IGNORE means existing rows are never duplicated
// or overwritten, so a schedule change mid-day only adds/omits rows going
// forward without disturbing doses already generated (and possibly taken).
function ensureTodayDoseEvents(db, personId, now) {
  const todayDate = torontoDateString(now);
  const dayAbbrev = torontoDayAbbrev(now);

  const medications = db
    .prepare('SELECT * FROM medications WHERE person_id = ? AND active = 1')
    .all(personId);

  const insertIfMissing = db.prepare(`
    INSERT OR IGNORE INTO dose_events (id, medication_id, scheduled_date, scheduled_time)
    VALUES (?, ?, ?, ?)
  `);

  const ensure = db.transaction(() => {
    for (const med of medications) {
      if (!scheduleAppliesToday(med.schedule_json, dayAbbrev)) continue;
      for (const time of scheduleTimes(med.schedule_json)) {
        insertIfMissing.run(crypto.randomUUID(), med.id, todayDate, time);
      }
    }
  });
  ensure();

  return todayDate;
}

function getTodayForPerson(db, personId, now = new Date()) {
  const todayDate = ensureTodayDoseEvents(db, personId, now);

  const doses = db
    .prepare(
      `
      SELECT de.id AS dose_event_id, de.scheduled_time, de.taken_at,
             m.id AS medication_id, m.name, m.dosage, m.color, m.description
      FROM dose_events de
      JOIN medications m ON m.id = de.medication_id
      WHERE m.person_id = ? AND de.scheduled_date = ?
      ORDER BY de.scheduled_time ASC
    `
    )
    .all(personId, todayDate)
    .map((row) => ({
      dose_event_id: row.dose_event_id,
      medication_id: row.medication_id,
      name: row.name,
      dosage: row.dosage,
      color: row.color,
      description: row.description,
      scheduled_time: row.scheduled_time,
      taken: !!row.taken_at,
      taken_at: row.taken_at,
    }));

  const allAppointments = db
    .prepare('SELECT * FROM appointments WHERE person_id = ? ORDER BY datetime_utc ASC')
    .all(personId);

  const appointmentsToday = allAppointments.filter(
    (a) => torontoDateString(new Date(a.datetime_utc)) === todayDate
  );

  const appointmentsUpcoming = allAppointments
    .filter((a) => torontoDateString(new Date(a.datetime_utc)) > todayDate)
    .slice(0, 3);

  return {
    date: todayDate,
    doses,
    appointments_today: appointmentsToday,
    appointments_upcoming: appointmentsUpcoming,
  };
}

module.exports = { getTodayForPerson, ensureTodayDoseEvents };
