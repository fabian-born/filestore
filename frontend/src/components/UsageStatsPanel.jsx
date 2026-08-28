import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';

export default function UsageStatsPanel() {
  const { t } = useSettings();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getUsageStats()
      .then(setData)
      .catch((err) => setError(t(`errors.${err.code}`)));
  }, [t]);

  if (error) return <p className="alert">{error}</p>;
  if (!data) return <p className="hint">{t('fileList.loading')}</p>;

  const { mobile, desktop, unknown } = data.deviceSplit;
  const deviceTotal = (mobile || 0) + (desktop || 0) + (unknown || 0);
  const mobilePercent = deviceTotal ? Math.round(((mobile || 0) / deviceTotal) * 100) : 0;

  return (
    <div className="stats-section">
      <h3>{t('stats.usage.title')}</h3>

      <div className="stats-summary">
        <div className="stats-summary-item">
          <span className="stats-summary-value">
            {data.activeSessions === null ? t('stats.usage.unknown') : data.activeSessions}
          </span>
          <span className="stats-summary-label">{t('stats.usage.activeSessions')}</span>
        </div>
      </div>

      <h4>{t('stats.usage.deviceSplit')}</h4>
      {deviceTotal === 0 ? (
        <p className="hint">{t('stats.usage.empty')}</p>
      ) : (
        <>
          <div className="quota-footer">
            <div className="quota-bar" style={{ width: '160px' }}>
              <div className="quota-bar-fill" style={{ width: `${mobilePercent}%` }} />
            </div>
            <span className="quota-label">
              {t('stats.usage.desktop')}: {desktop || 0} · {t('stats.usage.mobile')}: {mobile || 0}
              {unknown ? ` · ${t('stats.usage.unknown')}: ${unknown}` : ''}
            </span>
          </div>

          <h4>{t('stats.usage.loginTrend')}</h4>
          {data.loginTrend.length === 0 ? (
            <p className="hint">{t('stats.usage.empty')}</p>
          ) : (
            <table className="users-table">
              <thead>
                <tr>
                  <th>{t('stats.usage.date')}</th>
                  <th>{t('stats.usage.local')}</th>
                  <th>{t('stats.usage.oauth')}</th>
                </tr>
              </thead>
              <tbody>
                {data.loginTrend.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{row.local}</td>
                    <td>{row.oauth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
