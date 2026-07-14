export interface Person {
  id: number;
  name: string;
  date_of_birth: string | null;
  notes: string | null;
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

export interface Dose {
  dose_event_id: string;
  medication_id: number;
  name: string;
  dosage: string | null;
  color: string | null;
  description: string | null;
  scheduled_time: string;
  taken: boolean;
  taken_at: string | null;
}

export interface Appointment {
  id: number;
  person_id: number;
  doctor_id: number | null;
  datetime_utc: string;
  location: string | null;
  prep_notes: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface DoseEventRow {
  id: string;
  medication_id: number;
  scheduled_date: string;
  scheduled_time: string;
  taken_at: string | null;
  created_at: string;
}

export interface TodayResponse {
  date: string; // YYYY-MM-DD in America/Toronto
  doses: Dose[];
  appointments_today: Appointment[];
  appointments_upcoming: Appointment[];
}

export type TextSize = 'large' | 'xl';
