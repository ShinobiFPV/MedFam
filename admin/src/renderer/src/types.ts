export interface Person {
  id: number;
  name: string;
  date_of_birth: string | null;
  notes: string | null;
  created_at: string;
}

export interface Medication {
  id: number;
  person_id: number;
  name: string;
  brand_name: string | null;
  dosage: string | null;
  color: string | null;
  description: string | null;
  schedule_json: string;
  active: number;
  created_at: string;
}

export interface Doctor {
  id: number;
  person_id: number;
  name: string;
  specialty: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface Appointment {
  id: number;
  person_id: number;
  doctor_id: number | null;
  datetime_utc: string;
  location: string | null;
  prep_notes: string | null;
  confirmed_at: string | null;
  series_id: string | null;
  recurrence_rule: string | null;
  created_at: string;
}

export interface RecurrenceRule {
  unit: 'week' | 'month' | 'year';
  interval: number;
  count: number;
}

export interface Action {
  id: number;
  person_id: number;
  name: string;
  category: string | null;
  notes: string | null;
  schedule_json: string;
  active: number;
  created_at: string;
}

export interface MedicalDocument {
  id: number;
  person_id: number;
  title: string;
  category: string | null;
  notes: string | null;
  original_filename: string;
  stored_filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
}

export interface DoseHistoryEntry {
  dose_event_id: string;
  scheduled_date: string;
  scheduled_time: string;
  taken_at: string | null;
  medication_id: number;
  name: string;
  dosage: string | null;
  color: string | null;
}

export interface Schedule {
  times: string[];
  days: 'daily' | string[];
}
