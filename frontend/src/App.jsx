import { useEffect, useState } from 'react';
import * as api from './api.js';
import Login from './components/Login.jsx';
import FileBrowser from './components/FileBrowser.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import SetupPending from './components/SetupPending.jsx';
import ActivityPage from './components/ActivityPage.jsx';
import StatsPage from './components/StatsPage.jsx';
import { useSettings } from './context/SettingsContext.jsx';

const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// No router in this app - the file browser itself doesn't reflect its
// folder in the URL either. These are the pages worth a real, bookmarkable
// path, so they get a minimal manual sync with the History API instead of
// pulling in a routing library for two routes.
function viewFromPath() {
  const path = window.location.pathname;
  if (path === '/activity') return 'activity';
  if (path === '/stats') return 'stats';
  return 'browser';
}

function toUser(data) {
  return {
    id: data.id,
    username: data.username,
    isAdmin: data.isAdmin,
    authMethod: data.authMethod,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
  };
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [user, setUser] = useState(null);
  const [view, setView] = useState(viewFromPath);
  const { settings, loaded } = useSettings();

  useEffect(() => {
    api.onUnauthorized(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    const onPopState = () => setView(viewFromPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setView(viewFromPath());
  };

  useEffect(() => {
    api
      .me()
      .then((data) => {
        setUser(toUser(data));
        setAuthenticated(true);
      })
      .catch(() => setAuthenticated(false));
  }, []);

  // Poll while the tab stays open so an expired session redirects to the
  // login screen even without the user triggering an API call themselves.
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      api.me().catch(() => {});
    }, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [authenticated]);

  if (authenticated === null || (authenticated && !loaded)) return null;

  if (!authenticated) {
    return (
      <Login
        onSuccess={() => {
          api
            .me()
            .then((data) => setUser(toUser(data)))
            .catch(() => {});
          setAuthenticated(true);
        }}
      />
    );
  }

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setAuthenticated(false);
  };

  const needsSetup = !settings.bucketConfigured;
  if (needsSetup) {
    return user?.isAdmin ? (
      <SetupWizard onLogout={handleLogout} />
    ) : (
      <SetupPending onLogout={handleLogout} />
    );
  }

  if (view === 'activity') {
    return <ActivityPage user={user} onBack={() => navigate('/')} onLogout={handleLogout} />;
  }

  if (view === 'stats') {
    return <StatsPage user={user} onBack={() => navigate('/')} onLogout={handleLogout} />;
  }

  return (
    <FileBrowser
      onLogout={handleLogout}
      onUnauthorized={() => setAuthenticated(false)}
      onOpenActivity={() => navigate('/activity')}
      onOpenStats={() => navigate('/stats')}
      user={user}
    />
  );
}
