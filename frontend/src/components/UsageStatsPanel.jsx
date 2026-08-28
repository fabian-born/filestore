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
  const pct = (n) => (deviceTotal ? ((n || 0) / deviceTotal) * 100 : 0);

  return (
    <div className="stats-section">
      <div className="stats-summary">
        <div className="stats-summary-item">
          <span className="stats-summary-value stats-value-indigo">
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
          <div className="split-bar">
            <div className="split-bar-segment" style={{ width: `${pct(desktop)}%`, background: '#1e7a86' }} />
            <div className="split-bar-segment" style={{ width: `${pct(mobile)}%`, background: '#4f46e5' }} />
            {unknown ? (
              <div className="split-bar-segment" style={{ width: `${pct(unknown)}%`, background: '#94a3b8' }} />
            ) : null}
          </div>
          <ul className="pie-legend">
            <li>
              <span className="pie-swatch" style={{ background: '#1e7a86' }} />
              <span className="pie-legend-label">{t('stats.usage.desktop')}</span>
              <span className="pie-legend-value">{desktop || 0}</span>
            </li>
            <li>
              <span className="pie-swatch" style={{ background: '#4f46e5' }} />
              <span className="pie-legend-label">{t('stats.usage.mobile')}</span>
              <span className="pie-legend-value">{mobile || 0}</span>
            </li>
            {unknown ? (
              <li>
                <span className="pie-swatch" style={{ background: '#94a3b8' }} />
                <span className="pie-legend-label">{t('stats.usage.unknown')}</span>
                <span className="pie-legend-value">{unknown}</span>
              </li>
            ) : null}
          </ul>

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
