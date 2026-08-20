import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { DiscoverProfile } from '../../types/models';
import { TranslationKey, useI18n } from '../../i18n';

interface SwipeCardProps {
  profile: DiscoverProfile;
  style?: CSSProperties;
  showAge?: boolean;
  showDistance?: boolean;
  showIntent?: boolean;
  showInterests?: boolean;
  showInstagramTag?: boolean;
  showSpotifyTag?: boolean;
}

const intentLabelKeys: Record<NonNullable<DiscoverProfile['intent']>, TranslationKey> = {
  relationship: 'intent.relationship',
  friendship: 'intent.friendship',
  casual: 'intent.casual',
  notSure: 'intent.notSure'
};

export function SwipeCard({
  profile,
  style,
  showAge = true,
  showDistance = true,
  showIntent = true,
  showInterests = true,
  showInstagramTag = true,
  showSpotifyTag = true
}: SwipeCardProps): JSX.Element {
  const { t } = useI18n();
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
                className="swipe-card__photo-arrow swipe-card__photo-arrow--previous"
                onClick={() => movePhoto(-1)}
                onMouseDown={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                disabled={photoIndex === 0}
                aria-label="Foto precedente"
              >
                ‹
              </button>
              <button
                type="button"
                className="swipe-card__photo-arrow swipe-card__photo-arrow--next"
                onClick={() => movePhoto(1)}
                onMouseDown={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                disabled={photoIndex === photos.length - 1}
                aria-label="Foto successiva"
              >
                ›
              </button>
            </div>
          </>
        )}
      </div>

      <div className="swipe-card__body">
        <h3>
          {profile.name}
          {showAge ? `, ${profile.age}` : ''}
        </h3>
        {profile.city ? <p className="swipe-card__location">{profile.city}</p> : null}
        <p>{profile.bio}</p>

        <div className="swipe-card__hero-meta">
          {profile.compatibilityScore ? (
            <span className="swipe-card__tag swipe-card__tag--accent">
              {profile.compatibilityScore}% {t('profile.compatibility')}
            </span>
          ) : null}
          {showDistance && profile.distanceKm ? (
            <span className="swipe-card__tag">{profile.distanceKm} km</span>
          ) : null}
          {showIntent && profile.intent ? (
            <span className="swipe-card__tag">{t(intentLabelKeys[profile.intent])}</span>
          ) : null}
        </div>

        {showInterests && profile.commonInterests && profile.commonInterests.length > 0 ? (
          <div className="swipe-card__interest-list">
            {profile.commonInterests.map((interest) => (
              <span key={interest} className="swipe-card__interest-pill">
                {interest}
              </span>
            ))}
          </div>
        ) : null}

        {(showInstagramTag && profile.instagramTag) || (showSpotifyTag && profile.spotifyTag) ? (
          <div className="swipe-card__interest-list">
            {showInstagramTag && profile.instagramTag ? (
              <span className="swipe-card__interest-pill">Instagram: @{profile.instagramTag}</span>
            ) : null}
            {showSpotifyTag && profile.spotifyTag ? (
              <span className="swipe-card__interest-pill">Spotify: {profile.spotifyTag}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
