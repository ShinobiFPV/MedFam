import { usePerson } from '../context/PersonContext';
import { useDoctors } from '../hooks/useDoctors';
import { useAppointments } from '../hooks/useAppointments';
import { formatApptDateTime } from '../lib/timezone';
import { SkeletonCard } from '../components/SkeletonCard';
import { OfflineBanner } from '../components/OfflineBanner';
import styles from './Appointments.module.css';

interface AppointmentsScreenProps {
  onBack: () => void;
}

export function AppointmentsScreen({ onBack }: AppointmentsScreenProps) {
  const { personId } = usePerson();
  const doctors = useDoctors(personId);
  const { appointments, loading, confirm } = useAppointments(personId);

  const doctorInfo = (doctorId: number | null) => doctors.find((d) => d.id === doctorId);

  return (
    <div className={styles.screen}>
      <OfflineBanner />

      <header className={styles.header}>
        <h1 className={styles.title}>Upcoming Appointments</h1>
      </header>

      <main className={styles.content}>
        {loading && appointments.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : appointments.length === 0 ? (
          <div className={styles.empty}>No upcoming appointments</div>
        ) : (
          appointments.map((appt) => {
            const doctor = doctorInfo(appt.doctor_id);
            const { date, time } = formatApptDateTime(appt.datetime_utc);
            const confirmed = !!appt.confirmed_at;
            return (
              <div key={appt.id} className={styles.card}>
                <div className={styles.dateTime}>
                  {date} · {time}
                </div>
                <div className={styles.doctor}>{doctor?.name ?? 'Doctor'}</div>
                {doctor?.specialty ? <div className={styles.specialty}>{doctor.specialty}</div> : null}
                {appt.location ? <div className={styles.location}>{appt.location}</div> : null}
                {appt.prep_notes ? <div className={styles.prep}>{appt.prep_notes}</div> : null}
                <button
                  type="button"
                  className={confirmed ? styles.confirmedButton : styles.confirmButton}
                  onClick={() => !confirmed && confirm(appt.id)}
                  disabled={confirmed}
                >
                  {confirmed ? 'Confirmed ✓' : 'Got it 👍'}
                </button>
              </div>
            );
          })
        )}
      </main>

      <button type="button" className={styles.backButton} onClick={onBack}>
        Back to Today
      </button>
    </div>
  );
}
