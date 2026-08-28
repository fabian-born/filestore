import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';

const LOCALES = { de: 'de-DE', en: 'en-US' };

// <input type="datetime-local"> needs "YYYY-MM-DDTHH:mm" in local time, not
// the UTC ISO string the backend stores.
function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ShareModal({ fileKey, onClose }) {
  const { settings, t } = useSettings();
  const locale = LOCALES[settings.language] || LOCALES.de;
  const [loading, setLoading] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [token, setToken] = useState(null);
  const [url, setUrl] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState(null);
  const [emailRecipients, setEmailRecipients] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  const [invites, setInvites] = useState([]);

  const loadInvites = () =>
    api
      .getShareEmailInvites(fileKey)
      .then((data) => setInvites(data.invites || []))
      .catch(() => {});

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getShare(fileKey), api.getFileStats(fileKey).catch(() => null), api.getShareEmailInvites(fileKey).catch(() => ({ invites: [] }))])
      .then(([shareData, statsData, invitesData]) => {
        if (cancelled) return;
        if (shareData.share) {
          setToken(shareData.share.token);
          setUrl(shareData.share.url);
          setExpiresAt(toLocalInputValue(shareData.share.expiresAt));
          setPreviewEnabled(shareData.share.previewEnabled);
        }
        if (statsData) setStats(statsData);
        setInvites(invitesData.invites || []);
      })
      .catch((err) => !cancelled && setError(t(`errors.${err.code}`)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  useEffect(() => {
    if (!url) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 180 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await api.createShare(
        fileKey,
        expiresAt ? new Date(expiresAt).toISOString() : null,
        previewEnabled
      );
      setToken(data.token);
      setUrl(data.url);
    } catch (err) {
      setError(t(`errors.${err.code}`));
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revoke = async () => {
    if (!token) return;
    setRevoking(true);
    setError(null);
    try {
      await api.revokeShare(token);
      onClose();
    } catch (err) {
      setError(t(`errors.${err.code}`));
      setRevoking(false);
    }
  };

  const sendShareEmail = async () => {
    const recipients = emailRecipients
      .split(/[\s,;]+/)
      .map((r) => r.trim())
      .filter(Boolean);
    if (recipients.length === 0) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      const data = await api.emailShare(token, recipients);
      setEmailResult({ ok: true, sent: data.sent, failed: data.failed, total: data.total });
      setEmailRecipients('');
      await loadInvites();
    } catch (err) {
      setEmailResult({ ok: false, message: t(`errors.${err.code}`) });
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('share.title')}</h2>
        {error && <p className="alert">{error}</p>}

        {loading ? (
          <p className="hint">{t('fileList.loading')}</p>
        ) : (
          <>
            {stats && (stats.views > 0 || stats.downloads > 0) && (
              <p className="hint">
                {t('fileStats.views', { count: stats.views })} · {t('fileStats.downloads', { count: stats.downloads })}
              </p>
            )}

            <label className="field-label" htmlFor="share-expiry">
              {t('share.expiresAt')}
            </label>
            <input
              id="share-expiry"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={previewEnabled}
                onChange={(e) => setPreviewEnabled(e.target.checked)}
              />
              {t('share.enablePreview')}
            </label>
            <p className="hint">{t('share.enablePreviewHint')}</p>

            {url && (
              <>
                <p className="hint">{t('share.hint')}</p>
                <div className="share-link-row">
                  <input readOnly value={url} onFocus={(e) => e.target.select()} />
                  <button type="button" onClick={copy}>
                    {copied ? t('common.copied') : t('common.copy')}
                  </button>
                </div>
                {qrDataUrl && (
                  <div className="share-qr">
                    <img src={qrDataUrl} alt={t('share.qrAlt')} width="180" height="180" />
                  </div>
                )}

                {settings.smtpConfigured && (
                  <>
                    <label className="field-label" htmlFor="share-email-recipients">
                      {t('share.emailRecipients')}
                    </label>
                    <input
                      id="share-email-recipients"
                      type="text"
                      placeholder="a@example.com, b@example.com"
                      value={emailRecipients}
                      onChange={(e) => {
                        setEmailRecipients(e.target.value);
                        setEmailResult(null);
                      }}
                    />
                    <p className="hint">{t('share.emailRecipientsHint')}</p>
                    <div className="inline-test-row">
                      <button type="button" onClick={sendShareEmail} disabled={emailSending || !emailRecipients.trim()}>
                        {emailSending ? t('share.emailSending') : t('share.emailSend')}
                      </button>
                      {emailResult?.ok && (
                        <span className="inline-test-result ok">
                          {emailResult.failed > 0
                            ? t('share.emailPartial', { sent: emailResult.sent, total: emailResult.total })
                            : t('share.emailSuccess', { count: emailResult.sent })}
                        </span>
                      )}
                      {emailResult && !emailResult.ok && (
                        <span className="inline-test-result fail">{emailResult.message}</span>
                      )}
                    </div>
                  </>
                )}

                {invites.length > 0 && (
                  <>
                    <p className="field-label">{t('share.emailInvites')}</p>
                    <ul className="invite-list">
                      {invites.map((invite, i) => (
                        <li key={i} className={invite.success ? '' : 'invite-failed'}>
                          <span>{invite.recipient}</span>
                          <span className="invite-meta">
                            {new Date(invite.createdAt).toLocaleString(locale)}
                            {!invite.success && ` · ${t('share.emailInviteFailed')}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}

            <div className="modal-actions">
              {token && (
                <button type="button" className="danger" onClick={revoke} disabled={saving || revoking}>
                  {revoking ? t('share.revoking') : t('share.revoke')}
                </button>
              )}
              <button type="button" onClick={onClose} disabled={saving || revoking}>
                {t('common.close')}
              </button>
              <button type="button" onClick={save} disabled={saving || revoking}>
                {saving ? t('common.saving') : token ? t('share.update') : t('share.create')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
