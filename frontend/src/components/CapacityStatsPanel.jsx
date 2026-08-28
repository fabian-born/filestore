import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { formatBytes } from '../format.js';

// A fixed color per broad file-type category, reused between the pie chart
// and its legend. "document" reuses the app's own teal accent.
const CATEGORY_COLORS = {
  image: '#4f46e5',
  video: '#ec4899',
  audio: '#f59e0b',
  document: '#1e7a86',
  other: '#64748b',
  unknown: '#94a3b8',
};

function FileTypePieChart({ fileTypes, t }) {
  const total = fileTypes.reduce((sum, f) => sum + f.bytes, 0);
  let cumulative = 0;
  const stops = fileTypes.map((f) => {
    const start = total ? (cumulative / total) * 100 : 0;
    cumulative += f.bytes;
    const end = total ? (cumulative / total) * 100 : 0;
    const color = CATEGORY_COLORS[f.category] || CATEGORY_COLORS.unknown;
    return `${color} ${start}% ${end}%`;
  });
  const gradient = total > 0 ? `conic-gradient(${stops.join(', ')})` : 'var(--border)';

  return (
    <div className="pie-chart-row">
      <div className="pie-chart" style={{ background: gradient }} />
      <ul className="pie-legend">
        {fileTypes.map((f) => (
          <li key={f.category}>
            <span
              className="pie-swatch"
              style={{ background: CATEGORY_COLORS[f.category] || CATEGORY_COLORS.unknown }}
            />
            <span className="pie-legend-label">{t(`stats.capacity.categories.${f.category}`)}</span>
            <span className="pie-legend-value">
              {formatBytes(f.bytes)} ({total ? Math.round((f.bytes / total) * 100) : 0}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

  return (
    <div className="stats-section">
      <h3>{t('stats.capacity.title')}</h3>

      <div className="stats-summary">
        <div className="stats-summary-item">
          <span className="stats-summary-value stats-value-teal">{formatBytes(data.totalBytes)}</span>
          <span className="stats-summary-label">{t('stats.capacity.total')}</span>
        </div>
        <div className="stats-summary-item">
          <span className="stats-summary-value stats-value-indigo">{formatBytes(data.bandwidthBytes)}</span>
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
        <FileTypePieChart fileTypes={data.fileTypes} t={t} />
      )}
    </div>
  );
}
