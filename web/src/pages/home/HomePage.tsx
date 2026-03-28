import { useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { SwipeCard } from '../../components/home/SwipeCard';
import { useAppStore } from '../../hooks/useAppStore';
import { audienceMatches } from '../../types/models';

type Decision = 'left' | 'right';

export function HomePage(): JSX.Element {
  const { currentUser, discoverProfiles } = useAppStore();

  const filteredProfiles = useMemo(() => {
    const showMe = currentUser?.showMe ?? 'everyone';
    return discoverProfiles.filter((profile) => audienceMatches(showMe, profile.gender));
  }, [currentUser?.showMe, discoverProfiles]);

  const [index, setIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const pointerStart = useRef<number | null>(null);

  const activeProfile = filteredProfiles[index] ?? null;

  function performDecision(): void {
    pointerStart.current = null;
    setDragOffset(0);
    setIndex((prev) => prev + 1);
  }

  function onDecision(_: Decision): void {
    if (!activeProfile) {
      return;
    }
    performDecision();
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
      performDecision();
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
      </header>

      {activeProfile ? (
        <div className="swipe-card-wrap">
          <div
            onMouseDown={(event) => onPointerDown(event.clientX)}
            onMouseMove={(event) => onPointerMove(event.clientX)}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onTouchStart={(event) => onPointerDown(event.touches[0].clientX)}
            onTouchMove={(event) => onPointerMove(event.touches[0].clientX)}
            onTouchEnd={onPointerUp}
          >
            <SwipeCard
              profile={activeProfile}
              style={{
                transform: `translateX(${dragOffset}px) rotate(${dragOffset / 22}deg)`,
                transition: pointerStart.current === null ? 'transform 160ms ease-out' : 'none'
              }}
            />
          </div>

          <div className="swipe-actions">
            <Button variant="secondary" onClick={() => onDecision('left')}>
              Salta
            </Button>
            <Button onClick={() => onDecision('right')}>Fyre</Button>
          </div>
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
