import { NavLink, Outlet } from 'react-router-dom';
import { useMemo } from 'react';
import { useAppStore } from '../../hooks/useAppStore';
import { useI18n } from '../../i18n';
import { LanguageSwitch } from './LanguageSwitch';

interface MainTabItem {
  to: string;
  label: string;
}

export function MainTabsLayout(): JSX.Element {
  const {
    unreadNotificationsCount,
    unreadThreadsCount
  } = useAppStore();
  const { t } = useI18n();
  const unreadCount = unreadNotificationsCount + unreadThreadsCount;

  const tabs = useMemo<MainTabItem[]>(
    () => [
      { to: '/app/home', label: t('nav.discovery') },
      { to: '/app/messages', label: t('nav.messages') },
      { to: '/app/events', label: t('nav.events') },
      { to: '/app/account', label: t('nav.profile') }
    ],
    [t]
  );

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-topbar">
          <NavLink to="/app/home" className="app-topbar__brand">
            FYRE
          </NavLink>

          <nav className="app-topbar__nav" aria-label="Navigazione principale">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  isActive ? 'app-topbar__link is-active' : 'app-topbar__link'
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <div className="app-topbar__meta">
            <LanguageSwitch />

            <NavLink to="/app/account" className="app-topbar__app-icon" aria-label="Profile">
              <img src="/images/fyre-app-icon.png" alt="" aria-hidden />
              {unreadCount > 0 ? (
                <span className="app-topbar__counter-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </NavLink>
          </div>
        </div>
      </header>

      <main className="app-shell__content">
        <Outlet />
      </main>
    </div>
  );
}
