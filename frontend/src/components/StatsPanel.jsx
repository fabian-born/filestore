import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';

const LOCALES = { de: 'de-DE', en: 'en-US' };

export default function StatsPanel() {
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
