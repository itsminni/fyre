import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { DiscoverProfile } from '../../types/models';

interface SwipeCardProps {
  profile: DiscoverProfile;
  style?: CSSProperties;
  showAge?: boolean;
  showDistance?: boolean;
  showIntent?: boolean;
  showInterests?: boolean;
}

const INTENT_LABELS: Record<NonNullable<DiscoverProfile['intent']>, string> = {
  relationship: 'Relazione',
  friendship: 'Amicizia',
  casual: 'Casual',
  networking: 'Networking',
  notSure: 'Esplorazione'
};

export function SwipeCard({
  profile,
  style,
  showAge = true,
  showDistance = true,
  showIntent = true,
  showInterests = true
}: SwipeCardProps): JSX.Element {
  const photos = useMemo(() => {
    if (Array.isArray(profile.photos) && profile.photos.length > 0) {
      return profile.photos;
    }

    return profile.imageUrl ? [profile.imageUrl] : [];
  }, [profile.imageUrl, profile.photos]);

  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    setPhotoIndex(0);
  }, [profile.id]);

  const activePhoto = photos[photoIndex] ?? undefined;

  function movePhoto(delta: number): void {
    if (photos.length <= 1) {
      return;
    }

    setPhotoIndex((current) => {
      const next = current + delta;
      if (next < 0) {
        return 0;
      }
      if (next >= photos.length) {
        return photos.length - 1;
      }
      return next;
    });
  }

  return (
    <article className="swipe-card" style={style}>
      <div
        className="swipe-card__hero"
        style={
          activePhoto
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(9, 8, 11, 0.1), rgba(9, 8, 11, 0.72)), url(${activePhoto})`
              }
            : undefined
        }
      >
        {!activePhoto && <span className="swipe-card__fallback">{profile.name[0]}</span>}

        {photos.length > 1 && (
          <>
            <div className="swipe-card__photo-indicators" aria-hidden>
              {photos.map((photo) => (
                <span
                  key={photo}
                  className={photo === activePhoto
                    ? 'swipe-card__photo-dot is-active'
                    : 'swipe-card__photo-dot'}
                />
              ))}
            </div>

            <div className="swipe-card__photo-nav">
              <button
                type="button"
                onClick={() => movePhoto(-1)}
                disabled={photoIndex === 0}
                aria-label="Foto precedente"
              />
              <button
                type="button"
                onClick={() => movePhoto(1)}
                disabled={photoIndex === photos.length - 1}
                aria-label="Foto successiva"
              />
            </div>
          </>
        )}

        <div className="swipe-card__hero-meta">
          {profile.compatibilityScore ? (
            <span className="swipe-card__tag swipe-card__tag--accent">
              {profile.compatibilityScore}% compatibilita
            </span>
          ) : null}
          {showDistance && profile.distanceKm ? (
            <span className="swipe-card__tag">{profile.distanceKm} km</span>
          ) : null}
          {showIntent && profile.intent ? (
            <span className="swipe-card__tag">{INTENT_LABELS[profile.intent]}</span>
          ) : null}
        </div>
      </div>

      <div className="swipe-card__body">
        <h3>
          {profile.name}
          {showAge ? `, ${profile.age}` : ''}
        </h3>
        {profile.city ? <p className="swipe-card__location">{profile.city}</p> : null}
        <p>{profile.bio}</p>

        {showInterests && profile.commonInterests && profile.commonInterests.length > 0 ? (
          <div className="swipe-card__interest-list">
            {profile.commonInterests.map((interest) => (
              <span key={interest} className="swipe-card__interest-pill">
                {interest}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
