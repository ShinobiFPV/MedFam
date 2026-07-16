import { useState } from 'react';
import { usePerson } from '../context/PersonContext';
import { useToday } from '../hooks/useToday';
import { useDoctors } from '../hooks/useDoctors';
import { formatLongDate, timeOfDayBucket } from '../lib/timezone';
import { MedCard } from '../components/MedCard';
import { ActionCard } from '../components/ActionCard';
import { SkeletonCard } from '../components/SkeletonCard';
import { OfflineBanner } from '../components/OfflineBanner';
import { AppointmentBanner } from '../components/AppointmentBanner';
import { DescriptionSheet } from '../components/DescriptionSheet';
import type { DescriptionSheetItem } from '../components/DescriptionSheet';
import styles from './Today.module.css';

interface TodayScreenProps {
  onOpenAppointments: () => void;
  onOpenDoctors: () => void;
  onOpenSettings: () => void;
}

const SECTION_ORDER: Array<{ key: 'morning' | 'afternoon' | 'evening'; label: string }> = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
];

export function TodayScreen({ onOpenAppointments, onOpenDoctors, onOpenSettings }: TodayScreenProps) {
  const { person, personId } = usePerson();
  const { today, loading, toggleDose, toggleAction } = useToday(personId);
  const doctors = useDoctors(personId);
  const [infoItem, setInfoItem] = useState<DescriptionSheetItem | null>(null);

  const doctorName = (doctorId: number | null) => doctors.find((d) => d.id === doctorId)?.name;

  const grouped = today
    ? SECTION_ORDER.map((section) => ({
        ...section,
        doses: today.doses.filter((d) => timeOfDayBucket(d.scheduled_time) === section.key),
      })).filter((section) => section.doses.length > 0)
    : [];

  const hasNothingToday = !!today && today.doses.length === 0 && today.actions.length === 0;
  const showSkeleton = loading && !today;

  return (
    <div className={styles.screen}>
      <OfflineBanner />

      <header className={styles.header}>
        <button
          type="button"
          className={styles.settingsButton}
          onClick={onOpenSettings}
          aria-label="Settings"
        >
          ⚙
        </button>
        <div className={styles.date}>{formatLongDate()}</div>
        <div className={styles.personName}>{person?.name}</div>
      </header>

      <main className={styles.content}>
        {showSkeleton ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            {today?.appointments_today.map((appt) => (
              <AppointmentBanner key={appt.id} appointment={appt} doctorName={doctorName(appt.doctor_id)} />
            ))}

            {hasNothingToday ? (
              <div className={styles.empty}>Nothing scheduled today ✓</div>
            ) : (
              <>
                {grouped.map((section) => (
                  <section key={section.key} className={styles.section}>
                    <h2 className={styles.sectionTitle}>{section.label}</h2>
                    {section.doses.map((dose) => (
                      <MedCard
                        key={dose.dose_event_id}
                        dose={dose}
                        onToggle={(d, next) => toggleDose(d.dose_event_id, next)}
                        onShowInfo={(d) => setInfoItem({ name: d.name, description: d.description })}
                      />
                    ))}
                  </section>
                ))}

                {today && today.actions.length > 0 && (
                  <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Activities</h2>
                    {today.actions.map((action) => (
                      <ActionCard
                        key={action.action_event_id}
                        action={action}
                        onToggle={(a, next) => toggleAction(a.action_event_id, next)}
                        onShowInfo={(a) => setInfoItem({ name: a.name, description: a.notes })}
                      />
                    ))}
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>

      <div className={styles.bottomBar}>
        <button type="button" className={`${styles.bottomButton} ${styles.upcomingButton}`} onClick={onOpenAppointments}>
          Upcoming Appointments
        </button>
        <button type="button" className={`${styles.bottomButton} ${styles.doctorsButton}`} onClick={onOpenDoctors}>
          My Doctors
        </button>
      </div>

      <DescriptionSheet item={infoItem} onClose={() => setInfoItem(null)} />
    </div>
  );
}
