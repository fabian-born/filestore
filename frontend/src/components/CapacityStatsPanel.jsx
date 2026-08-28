import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { formatBytes } from '../format.js';

export default function CapacityStatsPanel() {
  const { t } = useSettings();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getCapacityStats()
      .then(setData)
      .catch((err) => setError(t(`errors.${err.code}`)));
  }, [t]);

  if (error) return <p className="alert">{error}</p>;
  if (!data) return <p className="hint">{t('fileList.loading')}</p>;

  const maxTypeBytes = Math.max(1, ...data.fileTypes.map((f) => f.bytes));

  return (
    <div className="stats-section">
      <h3>{t('stats.capacity.title')}</h3>

      <div className="stats-summary">
        <div className="stats-summary-item">
          <span className="stats-summary-value">{formatBytes(data.totalBytes)}</span>
          <span className="stats-summary-label">{t('stats.capacity.total')}</span>
        </div>
        <div className="stats-summary-item">
          <span className="stats-summary-value">{formatBytes(data.bandwidthBytes)}</span>
          <span className="stats-summary-label">{t('stats.capacity.bandwidth')}</span>
        </div>
      </div>

      <h4>{t('stats.capacity.growth')}</h4>
      {data.storageGrowth.length === 0 ? (
        <p className="hint">{t('stats.capacity.empty')}</p>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>{t('stats.usage.date')}</th>
              <th>{t('stats.storage.used')}</th>
            </tr>
          </thead>
          <tbody>
            {data.storageGrowth.map((row) => (
              <tr key={row.date}>
                <td>{row.date}</td>
                <td>{formatBytes(row.totalBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4>{t('stats.capacity.fileTypes')}</h4>
      {data.fileTypes.length === 0 ? (
        <p className="hint">{t('stats.capacity.empty')}</p>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>{t('fileList.name')}</th>
              <th>{t('stats.storage.used')}</th>
            </tr>
          </thead>
          <tbody>
            {data.fileTypes.map((row) => (
              <tr key={row.category}>
                <td>{t(`stats.capacity.categories.${row.category}`)}</td>
                <td>
                  <span className="quota-footer">
                    <span className="quota-bar">
                      <span
                        className="quota-bar-fill"
                        style={{ width: `${Math.max(4, Math.round((row.bytes / maxTypeBytes) * 100))}%` }}
                      />
                    </span>
                    <span className="quota-label">{formatBytes(row.bytes)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
