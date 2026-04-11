import { NavLink, Outlet } from 'react-router-dom';
import { useMemo } from 'react';
import { useAppStore } from '../../hooks/useAppStore';
import { getDisplayName } from '../../types/models';

interface MainTabItem {
  to: string;
  label: string;
  icon: string;
  badge?: number;
}

export function MainTabsLayout(): JSX.Element {
  const {
    currentUser,
    unreadNotificationsCount,
    unreadThreadsCount,
    persisted: { realtimeState }
  } = useAppStore();

  const greeting = useMemo(() => {
    if (!currentUser) {
      return 'Bentornato';
    }
    return `Ciao, ${getDisplayName(currentUser).split(' ')[0]}`;
  }, [currentUser]);

  const tabs = useMemo<MainTabItem[]>(
    () => [
      { to: '/app/home', label: 'Home', icon: 'F' },
      {
        to: '/app/messages',
        label: 'Messaggi',
        icon: 'M',
        badge: unreadThreadsCount + unreadNotificationsCount
      },
      { to: '/app/events', label: 'Eventi', icon: 'E' },
      { to: '/app/account', label: 'Account', icon: 'A' }
    ],
    [unreadNotificationsCount, unreadThreadsCount]
  );

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <p className="app-shell__eyebrow">Fyre</p>
        <h1>{greeting}</h1>
        <p className="app-shell__status">
          <span
            className={
              realtimeState === 'connected'
                ? 'app-shell__status-dot app-shell__status-dot--ok'
                : realtimeState === 'connecting'
                  ? 'app-shell__status-dot app-shell__status-dot--warn'
                  : 'app-shell__status-dot'
            }
          />
          {realtimeState === 'connected'
            ? 'Realtime attivo'
            : realtimeState === 'connecting'
              ? 'Connessione realtime in corso'
              : 'Realtime disconnesso'}
        </p>
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
              {tab.badge && tab.badge > 0 ? (
                <span className="tab-bar__badge">{tab.badge > 99 ? '99+' : tab.badge}</span>
              ) : null}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
