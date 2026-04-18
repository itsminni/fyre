import { Link } from 'react-router-dom';
import { EventPreviewCard } from '../../components/events/EventPreviewCard';
import { useAppStore } from '../../hooks/useAppStore';

export function EventsPage(): JSX.Element {
  const { mainEventFlags, mainEventSnapshot, isEventAdminEnabled } = useAppStore();

  const registrationBadge = mainEventFlags.isRegistered
    ? 'Confermato'
    : mainEventFlags.isWaiting
      ? 'In attesa'
      : undefined;

  return (
    <section className="events-page fade-in-up">
      <header className="section-header">
        <p className="section-header__eyebrow">Eventi</p>
        <h2>Main Event</h2>
      </header>

      <EventPreviewCard snapshot={mainEventSnapshot} registrationBadge={registrationBadge} />

      {isEventAdminEnabled && (
        <Link className="inline-link" to="/app/events/admin">
          Apri console admin evento
        </Link>
      )}
    </section>
  );
}
