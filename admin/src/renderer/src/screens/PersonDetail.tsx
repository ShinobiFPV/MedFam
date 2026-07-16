import { useState } from 'react';
import { MedicationsScreen } from './Medications';
import { DoctorsScreen } from './Doctors';
import { AppointmentsScreen } from './Appointments';
import { ActionsScreen } from './Actions';
import { ComplianceScreen } from './Compliance';
import styles from './PersonDetail.module.css';

type Tab = 'medications' | 'doctors' | 'appointments' | 'actions' | 'compliance';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'medications', label: 'Medications' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'actions', label: 'Actions' },
  { key: 'compliance', label: 'Compliance' },
];

interface PersonDetailProps {
  personId: number;
  personName: string;
  onBack: () => void;
}

export function PersonDetail({ personId, personName, onBack }: PersonDetailProps) {
  const [tab, setTab] = useState<Tab>('medications');

  return (
    <div>
      <div className={styles.header}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          ← People
        </button>
        <h1 className={styles.name}>{personName}</h1>
      </div>
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? styles.tabActive : styles.tab}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.panel}>
        {tab === 'medications' && <MedicationsScreen personId={personId} />}
        {tab === 'doctors' && <DoctorsScreen personId={personId} />}
        {tab === 'appointments' && <AppointmentsScreen personId={personId} />}
        {tab === 'actions' && <ActionsScreen personId={personId} />}
        {tab === 'compliance' && <ComplianceScreen personId={personId} />}
      </div>
    </div>
  );
}
