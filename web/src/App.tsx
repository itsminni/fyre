import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { MainTabsLayout } from './components/layout/MainTabsLayout';
import { useAppStore } from './hooks/useAppStore';
import { isProfileComplete } from './types/models';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/auth/LoginPage';
import { SignUpPage } from './pages/auth/SignUpPage';
import { DemoNoticePage } from './pages/auth/DemoNoticePage';
import { ProfileSetupPage } from './pages/profile/ProfileSetupPage';
import { HomePage } from './pages/home/HomePage';
import { MessagesPage } from './pages/messages/MessagesPage';
import { ChatDetailPage } from './pages/messages/ChatDetailPage';
import { EventsPage } from './pages/events/EventsPage';
import { EventDetailPage } from './pages/events/EventDetailPage';
import { EventAdminPage } from './pages/events/EventAdminPage';
import { AccountPage } from './pages/account/AccountPage';
import { EventHistoryPage } from './pages/account/EventHistoryPage';

function ThemeBridge(): null {
  const {
    persisted: {
      settings: { language, themeMode }
    }
  } = useAppStore();

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;

    if (themeMode === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = systemDark ? 'dark' : 'light';
      return;
    }

    root.dataset.theme = themeMode;
  }, [language, themeMode]);

  return null;
}

function RequireAuth(): JSX.Element {
  const { currentUser } = useAppStore();

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function RequireCompletedProfile(): JSX.Element {
  const { currentUser } = useAppStore();

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  if (!isProfileComplete(currentUser)) {
    return <Navigate to="/profile/setup" replace />;
  }

  return <Outlet />;
}

function RootRedirect(): JSX.Element {
  const { currentUser } = useAppStore();

  if (!currentUser) {
    return <LandingPage />;
  }

  if (!isProfileComplete(currentUser)) {
    return <Navigate to="/profile/setup" replace />;
  }

  return <Navigate to="/app/home" replace />;
}

function AppRoutes(): JSX.Element {
  const { isAuthInitialized, persisted } = useAppStore();

  if (!isAuthInitialized) {
    const message = persisted.settings.language === 'it'
      ? 'Ripristino della sessione…'
      : 'Restoring your session…';

    return (
      <>
        <ThemeBridge />
        <main className="auth-bootstrap" role="status" aria-live="polite" aria-busy="true">
          <img src="/images/fyre-app-icon.png" alt="" aria-hidden />
          <span>{message}</span>
        </main>
      </>
    );
  }

  return (
    <>
      <ThemeBridge />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/signup" element={<SignUpPage />} />
        <Route path="/auth/demo-notice" element={<DemoNoticePage />} />

        <Route element={<RequireAuth />}>
          <Route path="/profile/setup" element={<ProfileSetupPage />} />
        </Route>

        <Route element={<RequireCompletedProfile />}>
          <Route path="/app" element={<MainTabsLayout />}>
            <Route index element={<Navigate to="/app/home" replace />} />
            <Route path="home" element={<HomePage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="messages/:threadId" element={<ChatDetailPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/main" element={<EventDetailPage />} />
            <Route path="events/admin" element={<EventAdminPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="account/events" element={<EventHistoryPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App(): JSX.Element {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
