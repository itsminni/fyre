import { CSSProperties } from 'react';
import { DiscoverProfile } from '../../types/models';

interface SwipeCardProps {
  profile: DiscoverProfile;
  style?: CSSProperties;
}

export function SwipeCard({ profile, style }: SwipeCardProps): JSX.Element {
  return (
    <article className="swipe-card" style={style}>
      <div
        className="swipe-card__hero"
        style={
          profile.imageUrl
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(9, 8, 11, 0.1), rgba(9, 8, 11, 0.72)), url(${profile.imageUrl})`
              }
            : undefined
        }
      >
        {!profile.imageUrl && <span className="swipe-card__fallback">{profile.name[0]}</span>}
      </div>

      <div className="swipe-card__body">
        <h3>
          {profile.name}, {profile.age}
        </h3>
        <p>{profile.bio}</p>
      </div>
    </article>
  );
}
