import { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
}

export function Card({ title, subtitle, children, className = '', headerAction }: CardProps): JSX.Element {
  return (
    <section className={['ui-card', className].filter(Boolean).join(' ')}>
      {(title || subtitle || headerAction) && (
        <header className="ui-card__header">
          <div className="ui-card__header-main">
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {headerAction ? <div className="ui-card__header-action">{headerAction}</div> : null}
        </header>
      )}
      <div className="ui-card__body">{children}</div>
    </section>
  );
}
