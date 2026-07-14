import { useState } from 'react';
import { PersonProvider, usePerson } from './context/PersonContext';
import { TextSizeProvider } from './context/TextSizeContext';
import { QueueProvider } from './context/QueueContext';
import { PersonPickerScreen } from './screens/PersonPicker';
import { TodayScreen } from './screens/Today';
import { AppointmentsScreen } from './screens/Appointments';
import { SettingsScreen } from './screens/Settings';

type Screen = 'today' | 'appointments' | 'settings';

function Router() {
  const { personId } = usePerson();
  const [screen, setScreen] = useState<Screen>('today');

  if (personId == null) {
    return <PersonPickerScreen />;
  }

  switch (screen) {
    case 'appointments':
      return <AppointmentsScreen onBack={() => setScreen('today')} />;
    case 'settings':
      return <SettingsScreen onBack={() => setScreen('today')} />;
    case 'today':
    default:
      return (
        <TodayScreen
          onOpenAppointments={() => setScreen('appointments')}
          onOpenSettings={() => setScreen('settings')}
        />
      );
  }
}

export default function App() {
  return (
    <TextSizeProvider>
      <PersonProvider>
        <QueueProvider>
          <div className="app-root">
            <Router />
          </div>
        </QueueProvider>
      </PersonProvider>
    </TextSizeProvider>
  );
}
