import { usePerson } from '../context/PersonContext';
import styles from './PersonPicker.module.css';

export function PersonPickerScreen() {
  const { people, selectPerson, loading } = usePerson();

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Who is this for?</h1>
      {loading && people.length === 0 ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <div className={styles.list}>
          {people.map((person) => (
            <button
              key={person.id}
              type="button"
              className={styles.personButton}
              onClick={() => selectPerson(person.id)}
            >
              {person.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
