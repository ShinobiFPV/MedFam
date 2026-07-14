import type { Appointment } from '../types';
import { formatApptDateTime } from '../lib/timezone';
import styles from './AppointmentBanner.module.css';

interface AppointmentBannerProps {
  appointment: Appointment;
  doctorName?: string;
}

export function AppointmentBanner({ appointment, doctorName }: AppointmentBannerProps) {
  const { time } = formatApptDateTime(appointment.datetime_utc);

  return (
    <div className={styles.banner}>
      <div className={styles.label}>Appointment today</div>
      <div className={styles.doctor}>{doctorName ?? 'Doctor'}</div>
      <div className={styles.details}>
        {time}
        {appointment.location ? ` · ${appointment.location}` : ''}
      </div>
    </div>
  );
}
