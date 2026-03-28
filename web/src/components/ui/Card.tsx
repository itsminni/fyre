import { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, children, className = '' }: CardProps): JSX.Element {
  return (
    <section className={['ui-card', className].filter(Boolean).join(' ')}>
      {(title || subtitle) && (
        <header className="ui-card__header">
          {title && <h3>{title}</h3>}
          {subtitle && <p>{subtitle}</p>}
        </header>
      )}
      <div className="ui-card__body">{children}</div>
    </section>
  );
}
