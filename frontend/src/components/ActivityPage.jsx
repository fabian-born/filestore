import ActivityPanel from './ActivityPanel.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function ActivityPage({ user, onBack, onLogout }) {
  const { t } = useSettings();

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t('activity.title')}</h1>
        <div className="header-actions">
          <button type="button" className="link" onClick={onBack}>
            {t('activity.back')}
          </button>
          <button className="logout-btn" onClick={onLogout}>
            {t('nav.logout')}
          </button>
        </div>
      </header>

      <ActivityPanel showUser={user?.isAdmin} />
    </div>
  );
}
