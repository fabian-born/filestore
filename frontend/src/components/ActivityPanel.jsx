import { useEffect, useState } from 'react';
import * as api from '../api.js';
import Pagination from './Pagination.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

const LOCALES = { de: 'de-DE', en: 'en-US' };

export default function ActivityPanel({ showUser }) {
  const { t, settings } = useSettings();
  const locale = LOCALES[settings.language] || LOCALES.de;
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const offset = pageSize === 'all' ? 0 : page * pageSize;
    api
      .getActivity(pageSize, offset)
      .then((data) => {
        if (pageSize !== 'all' && data.total > 0 && offset >= data.total) {
          setPage(Math.max(0, Math.ceil(data.total / pageSize) - 1));
          return;
        }
        setEntries(data.entries);
        setTotal(data.total);
      })
      .catch((err) => setError(t(`errors.${err.code}`)))
      .finally(() => setLoading(false));
  }, [t, page, pageSize]);

  useEffect(() => {
    setPage(0);
  }, [pageSize]);

  const describe = (entry) => {
    const detail = entry.action === 'login' ? t(`activity.methods.${entry.detail}`) : entry.detail || '';
    return t(`activity.actions.${entry.action}`, { key: entry.objectKey || '', detail });
  };

  return (
    <div className="activity-panel">
      {error && <p className="alert">{error}</p>}

      {loading ? (
        <p className="hint">{t('fileList.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="hint">{t('activity.empty')}</p>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>{t('activity.columns.time')}</th>
              {showUser && <th>{t('activity.columns.user')}</th>}
              <th>{t('activity.columns.action')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.createdAt).toLocaleString(locale)}</td>
                {showUser && <td>{entry.username || '—'}</td>}
                <td>{describe(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && (
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      )}
    </div>
  );
}
