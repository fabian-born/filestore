import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';

const LOCALES = { de: 'de-DE', en: 'en-US' };

export default function SecurityStatsPanel() {
  const { t, settings } = useSettings();
  const locale = LOCALES[settings.language] || LOCALES.de;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getSecurityStats()
      .then(setData)
      .catch((err) => setError(t(`errors.${err.code}`)));
  }, [t]);

  const describe = (entry) => t(`activity.actions.${entry.action}`, { key: entry.objectKey || '', detail: entry.detail || '' });

  if (error) return <p className="alert">{error}</p>;
  if (!data) return <p className="hint">{t('fileList.loading')}</p>;

  return (
    <div className="stats-section">
      <h3>{t('stats.security.title')}</h3>
      <div className="stats-summary">
        <div className="stats-summary-item">
          <span className="stats-summary-value">{data.blockedLogins24h}</span>
          <span className="stats-summary-label">{t('stats.security.blockedLogins')}</span>
        </div>
        <div className="stats-summary-item">
          <span className="stats-summary-value">{data.expiredShareAccess24h}</span>
          <span className="stats-summary-label">{t('stats.security.expiredAccess')}</span>
        </div>
      </div>

      <h4>{t('stats.security.recentChanges')}</h4>
      {data.recentAdminActions.length === 0 ? (
        <p className="hint">{t('stats.security.empty')}</p>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>{t('activity.columns.time')}</th>
              <th>{t('activity.columns.user')}</th>
              <th>{t('activity.columns.action')}</th>
            </tr>
          </thead>
          <tbody>
            {data.recentAdminActions.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.createdAt).toLocaleString(locale)}</td>
                <td>{entry.username}</td>
                <td>{describe(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
