import { EventPreviewCard } from '../../components/events/EventPreviewCard';
import { useAppStore } from '../../hooks/useAppStore';
import { useI18n } from '../../i18n';

export function EventsPage(): JSX.Element {
  const { hasMainEvent, mainEventFlags, mainEventInfo, mainEventSnapshot } = useAppStore();
  const { t } = useI18n();

  const registrationBadge = mainEventFlags.isRegistered
    ? t('events.badge.confirmed')
    : mainEventFlags.isWaiting
      ? t('events.badge.pending')
      : undefined;

  return (
    <section className="events-page fade-in-up">
      <header className="section-header">
        <h2>{t('events.title')}</h2>
      </header>

      {hasMainEvent ? (
        <EventPreviewCard
          snapshot={mainEventSnapshot}
          venue={mainEventInfo.venue || undefined}
          registrationBadge={registrationBadge}
        />
      ) : (
        <p className="empty-state">{t('events.unavailable')}</p>
      )}
    </section>
  );
}
