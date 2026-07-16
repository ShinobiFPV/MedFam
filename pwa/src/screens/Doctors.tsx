import { usePerson } from '../context/PersonContext';
import { useDoctors } from '../hooks/useDoctors';
import { useAppointments } from '../hooks/useAppointments';
import { formatApptDateTime } from '../lib/timezone';
import { SkeletonCard } from '../components/SkeletonCard';
import { OfflineBanner } from '../components/OfflineBanner';
import styles from './Doctors.module.css';

interface DoctorsScreenProps {
  onBack: () => void;
}

export function DoctorsScreen({ onBack }: DoctorsScreenProps) {
  const { personId } = usePerson();
  const doctors = useDoctors(personId);
  const { appointments, loading } = useAppointments(personId);

  // appointments is sorted soonest-first, so the first match per doctor is their next one.
  const nextAppointmentFor = (doctorId: number) => appointments.find((a) => a.doctor_id === doctorId);

  return (
    <div className={styles.screen}>
      <OfflineBanner />

      <header className={styles.header}>
        <h1 className={styles.title}>My Doctors</h1>
      </header>

      <main className={styles.content}>
        {loading && doctors.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : doctors.length === 0 ? (
          <div className={styles.empty}>No doctors yet</div>
        ) : (
          doctors.map((doctor) => {
            const nextAppt = nextAppointmentFor(doctor.id);
            return (
              <div key={doctor.id} className={styles.card}>
                <div className={styles.name}>{doctor.name}</div>
                {doctor.specialty ? <div className={styles.specialty}>{doctor.specialty}</div> : null}
                {doctor.phone ? (
                  <a href={`tel:${doctor.phone}`} className={styles.detail}>
                    📞 {doctor.phone}
                  </a>
                ) : null}
                {doctor.address ? <div className={styles.detail}>📍 {doctor.address}</div> : null}
                {doctor.notes ? <div className={styles.notes}>{doctor.notes}</div> : null}
                {nextAppt ? (
                  <div className={styles.apptNote}>
                    Upcoming appointment: {formatApptDateTime(nextAppt.datetime_utc).date} ·{' '}
                    {formatApptDateTime(nextAppt.datetime_utc).time}
                  </div>
                ) : null}
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
