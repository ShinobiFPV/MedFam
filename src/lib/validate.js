function exists(db, table, id) {
  if (id === undefined || id === null) return false;
  return !!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);
}

module.exports = {
  personExists: (db, id) => exists(db, 'people', id),
  medicationExists: (db, id) => exists(db, 'medications', id),
  doctorExists: (db, id) => exists(db, 'doctors', id),
  appointmentExists: (db, id) => exists(db, 'appointments', id),
};
