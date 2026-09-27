import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.js';
import { DeleteIcon } from './icons.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

const LOCALES = { de: 'de-DE', en: 'en-US' };

// Every active share link the user created (admins: everyone's), with its
// protection settings and usage at a glance - copy or revoke without having
// to find the file in the browser first.
export default function SharesPage({ user, onBack, onLogout }) {
  const { t, settings } = useSettings();
  const locale = LOCALES[settings.language] || LOCALES.de;
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(() => {
    setError(null);
    return api
      .getMyShares()
      .then((data) => setShares(data.shares))
      .catch((err) => setError(t(`errors.${err.code}`)))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (share) => {
    await navigator.clipboard.writeText(share.url);
    setCopiedToken(share.token);
    setTimeout(() => setCopiedToken((current) => (current === share.token ? null : current)), 2000);
  };

  const revoke = async (share) => {
    if (!window.confirm(t('shares.revokeConfirm', { name: share.fileName }))) return;
    setRevoking(share.token);
    try {
      await api.revokeShare(share.token);
      await load();
    } catch (err) {
      setError(t(`errors.${err.code}`));
    } finally {
      setRevoking(null);
    }
  };

  const formatDate = (iso) => new Date(iso).toLocaleString(locale);

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t('shares.title')}</h1>
        <div className="header-actions">
          <button type="button" className="link" onClick={onBack}>
            {t('activity.back')}
          </button>
          <button className="logout-btn" onClick={onLogout}>
            {t('nav.logout')}
          </button>
        </div>
      </header>

      <div className="activity-panel">
        {error && <p className="alert">{error}</p>}

        {loading ? (
          <p className="hint">{t('fileList.loading')}</p>
        ) : shares.length === 0 ? (
          <p className="hint">{t('shares.empty')}</p>
        ) : (
          <table className="users-table shares-table">
            <thead>
              <tr>
                <th>{t('shares.columns.file')}</th>
                {user?.isAdmin && <th>{t('shares.columns.createdBy')}</th>}
                <th>{t('shares.columns.expires')}</th>
                <th>{t('shares.columns.usage')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => (
                <tr key={share.token}>
                  <td>
                    <span title={share.objectKey}>{share.fileName}</span>
                    {share.hasPassword && <span className="badge">{t('shares.badges.password')}</span>}
                    {share.previewEnabled && <span className="badge">{t('shares.badges.preview')}</span>}
                    <div className="hint">{t('shares.createdAt', { date: formatDate(share.createdAt) })}</div>
                  </td>
                  {user?.isAdmin && <td>{share.createdBy || '—'}</td>}
                  <td>{share.expiresAt ? formatDate(share.expiresAt) : t('shares.never')}</td>
                  <td>
                    {t('fileStats.views', { count: share.views })}
                    <br />
                    {share.maxDownloads
                      ? t('shares.downloadsOfMax', { count: share.downloadCount, max: share.maxDownloads })
                      : t('fileStats.downloads', { count: share.downloadCount })}
                    {share.exhausted && <span className="badge warn">{t('shares.badges.exhausted')}</span>}
                  </td>
                  <td className="users-row-actions">
                    <button type="button" className="link" onClick={() => copy(share)}>
                      {copiedToken === share.token ? t('common.copied') : t('common.copy')}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title={t('share.revoke')}
                      aria-label={t('share.revoke')}
                      disabled={revoking === share.token}
                      onClick={() => revoke(share)}
                    >
                      <DeleteIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
