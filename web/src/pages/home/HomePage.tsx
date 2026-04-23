import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { SwipeCard } from '../../components/home/SwipeCard';
import { useAppStore } from '../../hooks/useAppStore';
import { preferredGenderMatches } from '../../types/models';

type Decision = 'left' | 'right';

export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const {
    currentUser,
    discoverProfiles,
    submitSwipeDecision,
    persisted: { settings }
  } = useAppStore();

  const filteredProfiles = useMemo(() => {
    const showMe = currentUser?.showMe ?? 'everyone';
    const preferredGenders = currentUser?.preferredGenders;

    return discoverProfiles.filter((profile) => {
      if (profile.relationshipState && profile.relationshipState !== 'none') {
        return false;
      }

      return preferredGenderMatches(preferredGenders, showMe, profile.gender);
    });
  }, [currentUser?.preferredGenders, currentUser?.showMe, discoverProfiles]);

  const [index, setIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [swipeFeedback, setSwipeFeedback] = useState<string | null>(null);
  const [lastMatch, setLastMatch] = useState<{ name: string; threadId: string } | null>(null);
  const pointerStart = useRef<number | null>(null);

  const activeProfile = filteredProfiles[index] ?? null;
  const queuedProfiles = filteredProfiles.slice(index, index + 3);

  async function performDecision(decision: Decision): Promise<void> {
    if (!activeProfile) {
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    const result = await submitSwipeDecision(activeProfile.id, decision);
    setIsSubmitting(false);

    setSwipeFeedback(result.message);

    if (result.matched && result.threadId) {
      setLastMatch({
        name: activeProfile.name,
        threadId: result.threadId
      });
    } else {
      setLastMatch(null);
    }

    pointerStart.current = null;
    setDragOffset(0);
    setIndex((prev) => prev + 1);
  }

  function onDecision(decision: Decision): void {
    if (!activeProfile) {
      return;
    }
    void performDecision(decision);
  }

  function onPointerDown(clientX: number): void {
    pointerStart.current = clientX;
  }

  function onPointerMove(clientX: number): void {
    if (pointerStart.current === null) {
      return;
    }
    setDragOffset(clientX - pointerStart.current);
  }

  function onPointerUp(): void {
    if (Math.abs(dragOffset) > 120) {
      void performDecision(dragOffset > 0 ? 'right' : 'left');
      return;
    }
    setDragOffset(0);
    pointerStart.current = null;
  }

  return (
    <section className="home-page fade-in-up">
      <header className="section-header">
        <p className="section-header__eyebrow">Scopri</p>
        <h2>Swipe Home</h2>
        <p className="text-muted">
          {activeProfile
            ? `${index + 1} di ${filteredProfiles.length} profili compatibili`
            : 'Hai finito i profili disponibili per adesso.'}
        </p>
      </header>

      {activeProfile ? (
        <div className="swipe-card-wrap">
          <div
            className="swipe-deck"
            onMouseDown={(event) => onPointerDown(event.clientX)}
            onMouseMove={(event) => onPointerMove(event.clientX)}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onTouchStart={(event) => onPointerDown(event.touches[0].clientX)}
            onTouchMove={(event) => onPointerMove(event.touches[0].clientX)}
            onTouchEnd={onPointerUp}
          >
            {queuedProfiles
              .slice()
              .reverse()
              .map((profile, reverseIndex) => {
                const deckIndex = queuedProfiles.length - 1 - reverseIndex;
                const isTopCard = deckIndex === 0;

                return (
                  <SwipeCard
                    key={profile.id}
                    profile={profile}
                    showAge={settings.showAge}
                    showDistance={settings.showDistance}
                    showIntent={settings.showIntent}
                    showInterests={settings.showInterests}
                    style={{
                      transform: isTopCard
                        ? `translateX(${dragOffset}px) translateY(0px) rotate(${dragOffset / 22}deg)`
                        : `translateY(${deckIndex * 10}px) scale(${1 - deckIndex * 0.035})`,
                      transition: isTopCard && pointerStart.current !== null
                        ? 'none'
                        : 'transform 180ms ease-out, opacity 180ms ease-out',
                      zIndex: String(queuedProfiles.length - deckIndex),
                      opacity: 1 - deckIndex * 0.08,
                      position: 'absolute',
                      inset: 0
                    }}
                  />
                );
              })}
          </div>

          <div className="swipe-actions">
            <Button variant="secondary" onClick={() => onDecision('left')} disabled={isSubmitting}>
              Salta
            </Button>
            <Button onClick={() => onDecision('right')} disabled={isSubmitting}>
              {isSubmitting ? 'Attendi...' : 'Fyre'}
            </Button>
          </div>

          {swipeFeedback && <p className="swipe-feedback">{swipeFeedback}</p>}

          {lastMatch && (
            <article className="match-panel">
              <h3>It s a match con {lastMatch.name}</h3>
              <p>La chat e stata creata. Puoi iniziare a scrivere subito.</p>
              <div className="match-panel__actions">
                <Button onClick={() => navigate(`/app/messages/${lastMatch.threadId}`)}>
                  Apri chat
                </Button>
                <Button variant="secondary" onClick={() => setLastMatch(null)}>
                  Continua swipe
                </Button>
              </div>
            </article>
          )}
        </div>
      ) : (
        <div className="empty-panel">
          <h3>Fine profili</h3>
          <p>Hai visto tutti i profili demo.</p>
          <Button variant="ghost" onClick={() => setIndex(0)}>
            Ricomincia
          </Button>
        </div>
      )}
    </section>
  );
}
