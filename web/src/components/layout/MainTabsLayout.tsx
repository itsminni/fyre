import { NavLink, Outlet } from 'react-router-dom';
import { useMemo } from 'react';
import { useAppStore } from '../../hooks/useAppStore';
import { getDisplayName } from '../../types/models';

const tabs = [
  { to: '/app/home', label: 'Home', icon: 'F' },
  { to: '/app/messages', label: 'Messaggi', icon: 'M' },
  { to: '/app/events', label: 'Eventi', icon: 'E' },
  { to: '/app/account', label: 'Account', icon: 'A' }
];

export function MainTabsLayout(): JSX.Element {
  const { currentUser } = useAppStore();

  const greeting = useMemo(() => {
    if (!currentUser) {
      return 'Bentornato';
    }
    return `Ciao, ${getDisplayName(currentUser).split(' ')[0]}`;
  }, [currentUser]);

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <p className="app-shell__eyebrow">Fyre</p>
        <h1>{greeting}</h1>
      </header>

      <main className="app-shell__content">
        <Outlet />
      </main>

      <nav className="tab-bar" aria-label="Main tabs">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => (isActive ? 'tab-bar__link is-active' : 'tab-bar__link')}
          >
            <span className="tab-bar__icon" aria-hidden>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
