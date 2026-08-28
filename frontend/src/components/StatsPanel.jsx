import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { formatBytes } from '../format.js';

const LOCALES = { de: 'de-DE', en: 'en-US' };

function StorageOverview({ t }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getStorageOverview()
      .then((data) => setUsers(data.users))
      .catch((err) => setError(t(`errors.${err.code}`)))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) return <p className="hint">{t('fileList.loading')}</p>;
  if (error) return <p className="alert">{error}</p>;

  const sorted = [...users].sort((a, b) => b.usedBytes - a.usedBytes);

  return (
    <div className="storage-overview">
      <h3>{t('stats.storage.title')}</h3>
      <table className="users-table">
        <thead>
          <tr>
            <th>{t('users.username')}</th>
            <th>{t('stats.storage.used')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((u) => {
            const percent = u.quotaBytes ? Math.min(100, Math.round((u.usedBytes / u.quotaBytes) * 100)) : null;
            const level = percent === null ? '' : percent >= 100 ? 'full' : percent >= 90 ? 'warn' : '';
            return (
              <tr key={u.id}>
                <td>
                  {u.username}
                  {u.isAdmin && <span className="badge">{t('users.admin')}</span>}
                </td>
                <td>
                  {u.quotaBytes ? (
                    <span className="quota-footer">
                      <span className="quota-bar">
                        <span className={`quota-bar-fill ${level}`} style={{ width: `${percent}%` }} />
                      </span>
                      <span className="quota-label">
                        {t('quota.usage', { used: formatBytes(u.usedBytes), total: formatBytes(u.quotaBytes) })}
                      </span>
                    </span>
                  ) : (
                    formatBytes(u.usedBytes)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StatsPanel({ showStorage }) {
  const { t, settings } = useSettings();
  const locale = LOCALES[settings.language] || LOCALES.de;
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getFileStatsList()
      .then((data) => setFiles(data.files))
      .catch((err) => setError(t(`errors.${err.code}`)))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <div className="stats-panel">
      {showStorage && <StorageOverview t={t} />}

      {error && <p className="alert">{error}</p>}

      {loading ? (
        <p className="hint">{t('fileList.loading')}</p>
      ) : files.length === 0 ? (
        <p className="hint">{t('stats.empty')}</p>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>{t('stats.columns.file')}</th>
              <th>{t('stats.columns.views')}</th>
              <th>{t('stats.columns.downloads')}</th>
              <th>{t('stats.columns.total')}</th>
              <th>{t('stats.columns.lastActivity')}</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.objectKey}>
                <td>{f.objectKey}</td>
                <td>{f.views}</td>
                <td>{f.downloads}</td>
                <td>{f.views + f.downloads}</td>
                <td>{new Date(f.lastAt).toLocaleString(locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
