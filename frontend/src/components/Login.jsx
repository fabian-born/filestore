import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import logo from '../assets/filestore_logo.png';

const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';

export default function Login({ onSuccess }) {
  const { settings, t, refresh } = useSettings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('oauthError');
    if (!code) return;
    setError(t(`errors.${code}`));
    const url = new URL(window.location.href);
    url.searchParams.delete('oauthError');
    window.history.replaceState({}, '', url);
  }, [t]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(username, password);
      await refresh().catch(() => {});
      onSuccess();
    } catch (err) {
      setError(t(`errors.${err.code}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src={logo} alt="Filestore" className="login-logo" />
        <h1>{t('login.title')}</h1>
        <label>
          {t('login.username')}
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          {t('login.password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? t('login.submitting') : t('login.submit')}
        </button>
        {settings.oauthEnabled && (
          <>
            <div className="login-divider">
              <span>{t('login.or')}</span>
            </div>
            <button type="button" className="login-oauth" onClick={() => window.location.assign(api.OAUTH_LOGIN_URL)}>
              {settings.oauthButtonLabel || t('login.oauthDefault')}
            </button>
          </>
        )}
        <p className="login-version">v{appVersion}</p>
      </form>
    </div>
  );
}
