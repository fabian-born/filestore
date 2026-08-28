import { useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import UsersPanel from './UsersPanel.jsx';
import AppInfoPanel from './AppInfoPanel.jsx';

export default function SettingsModal({ onClose, user }) {
  const { settings, updateSettings, updateOauthSettings, updateSmtpSettings, t } = useSettings();
  const [tab, setTab] = useState('general');

  const [shareDomain, setShareDomain] = useState(settings.shareDomain || '');
  const [language, setLanguage] = useState(settings.language || 'de');

  const [bucket, setBucket] = useState(settings.bucket || '');
  const [minioUrl, setMinioUrl] = useState(settings.minioUrl || '');
  const [minioAccessKey, setMinioAccessKey] = useState(settings.minioAccessKey || '');
  const [minioSecretKey, setMinioSecretKey] = useState('');

  const [smtpHost, setSmtpHost] = useState(settings.smtpHost || '');
  const [smtpPort, setSmtpPort] = useState(settings.smtpPort || '');
  const [smtpUsername, setSmtpUsername] = useState(settings.smtpUsername || '');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromAddress, setSmtpFromAddress] = useState(settings.smtpFromAddress || '');
  const [smtpFromName, setSmtpFromName] = useState(settings.smtpFromName || '');
  const [smtpSecure, setSmtpSecure] = useState(Boolean(settings.smtpSecure));

  const [oauthEnabled, setOauthEnabled] = useState(Boolean(settings.oauthEnabled));
  const [oauthIssuer, setOauthIssuer] = useState(settings.oauthIssuer || '');
  const [oauthClientId, setOauthClientId] = useState(settings.oauthClientId || '');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [oauthScopes, setOauthScopes] = useState(settings.oauthScopes || 'openid email profile');
  const [oauthButtonLabel, setOauthButtonLabel] = useState(settings.oauthButtonLabel || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [smtpTestRecipient, setSmtpTestRecipient] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState(null);

  const canEditOauth = user?.isAdmin && user?.authMethod === 'local';
  // Mirrors the backend: the share domain (if set) is used as the public base
  // URL for the OAuth redirect too, since it's the one reliable source of the
  // real external scheme/host behind this app's reverse proxy.
  const callbackUrl = `${(settings.shareDomain || window.location.origin).replace(/\/+$/, '')}/api/oauth/callback`;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (tab === 'oauth') {
        await updateOauthSettings({
          oauthEnabled,
          oauthIssuer: oauthIssuer.trim(),
          oauthClientId: oauthClientId.trim(),
          oauthClientSecret,
          oauthScopes: oauthScopes.trim(),
          oauthButtonLabel: oauthButtonLabel.trim(),
        });
      } else if (tab === 'smtp') {
        await updateSmtpSettings({
          smtpHost: smtpHost.trim(),
          smtpPort: smtpPort.trim(),
          smtpUsername: smtpUsername.trim(),
          smtpPassword,
          smtpFromAddress: smtpFromAddress.trim(),
          smtpFromName: smtpFromName.trim(),
          smtpSecure,
        });
      } else {
        await updateSettings({
          // Share domain and the bucket fields are admin-only - omitted
          // entirely for a regular user rather than sent unchanged, since the
          // backend rejects the request outright if they're present at all.
          shareDomain: user?.isAdmin ? shareDomain.trim() : undefined,
          language,
          bucket: user?.isAdmin ? bucket.trim() : undefined,
          minioUrl: user?.isAdmin ? minioUrl.trim() : undefined,
          minioAccessKey: user?.isAdmin ? minioAccessKey.trim() : undefined,
          minioSecretKey: user?.isAdmin ? minioSecretKey : undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(t(`errors.${err.code}`));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await api.testOauthSettings({
        oauthIssuer: oauthIssuer.trim(),
        oauthClientId: oauthClientId.trim(),
        oauthClientSecret,
      });
      setTestResult({ ok: true });
    } catch (err) {
      setTestResult({ ok: false, message: t(`errors.${err.code}`) });
    } finally {
      setTesting(false);
    }
  };

  const sendTestEmail = async () => {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      await api.testSmtpSettings({
        to: smtpTestRecipient.trim(),
        smtpHost: smtpHost.trim(),
        smtpPort: smtpPort.trim(),
        smtpUsername: smtpUsername.trim(),
        smtpPassword,
        smtpFromAddress: smtpFromAddress.trim(),
        smtpFromName: smtpFromName.trim(),
        smtpSecure,
      });
      setSmtpTestResult({ ok: true });
    } catch (err) {
      setSmtpTestResult({ ok: false, message: t(`errors.${err.code}`) });
    } finally {
      setSmtpTesting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('settings.title')}</h2>

        <div className="settings-tabs">
          <button
            type="button"
            className={`settings-tab ${tab === 'general' ? 'active' : ''}`}
            onClick={() => setTab('general')}
          >
            {t('settings.tabs.general')}
          </button>
          {user?.isAdmin && (
            <button
              type="button"
              className={`settings-tab ${tab === 'bucket' ? 'active' : ''}`}
              onClick={() => setTab('bucket')}
            >
              {t('settings.tabs.bucket')}
            </button>
          )}
          {user?.isAdmin && (
            <button
              type="button"
              className={`settings-tab ${tab === 'users' ? 'active' : ''}`}
              onClick={() => setTab('users')}
            >
              {t('settings.tabs.users')}
            </button>
          )}
          {user?.isAdmin && (
            <button
              type="button"
              className={`settings-tab ${tab === 'oauth' ? 'active' : ''}`}
              onClick={() => setTab('oauth')}
            >
              {t('settings.tabs.oauth')}
            </button>
          )}
          {user?.isAdmin && (
            <button
              type="button"
              className={`settings-tab ${tab === 'smtp' ? 'active' : ''}`}
              onClick={() => setTab('smtp')}
            >
              {t('settings.tabs.smtp')}
            </button>
          )}
          <button
            type="button"
            className={`settings-tab ${tab === 'appinfo' ? 'active' : ''}`}
            onClick={() => setTab('appinfo')}
          >
            {t('settings.tabs.appinfo')}
          </button>
        </div>

        {tab === 'users' || tab === 'appinfo' ? (
          <>
            {tab === 'users' ? <UsersPanel currentUserId={user?.id} /> : <AppInfoPanel />}
            <div className="modal-actions">
              <button type="button" onClick={onClose}>
                {t('common.close')}
              </button>
            </div>
          </>
        ) : (
        <form onSubmit={save}>
          {tab === 'general' && (
            <>
              <label className="field-label" htmlFor="settings-share-domain">
                {t('settings.shareDomain')}
              </label>
              <input
                id="settings-share-domain"
                type="text"
                placeholder="https://files.example.com"
                value={shareDomain}
                readOnly={!user?.isAdmin}
                onChange={(e) => setShareDomain(e.target.value)}
              />
              <p className="hint">{user?.isAdmin ? t('settings.shareDomainHint') : t('settings.shareDomainReadOnlyHint')}</p>

              <label className="field-label" htmlFor="settings-language">
                {t('settings.language')}
              </label>
              <select id="settings-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </>
          )}

          {tab === 'bucket' && (
            <>
              <label className="field-label" htmlFor="settings-bucket">
                {t('settings.bucket')}
              </label>
              <input
                id="settings-bucket"
                type="text"
                placeholder="webtools"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
              />
              <p className="hint">{t('settings.bucketHint')}</p>

              <label className="field-label" htmlFor="settings-minio-url">
                {t('settings.minioUrl')}
              </label>
              <input
                id="settings-minio-url"
                type="text"
                placeholder="https://minio.example.com:9000"
                value={minioUrl}
                onChange={(e) => setMinioUrl(e.target.value)}
              />
              <p className="hint">{t('settings.minioUrlHint')}</p>

              <label className="field-label" htmlFor="settings-minio-access-key">
                {t('settings.minioAccessKey')}
              </label>
              <input
                id="settings-minio-access-key"
                type="text"
                autoComplete="off"
                value={minioAccessKey}
                onChange={(e) => setMinioAccessKey(e.target.value)}
              />

              <label className="field-label" htmlFor="settings-minio-secret-key">
                {t('settings.minioSecretKey')}
              </label>
              <input
                id="settings-minio-secret-key"
                type="password"
                autoComplete="new-password"
                placeholder={settings.minioSecretKeySet ? t('settings.minioSecretKeySetPlaceholder') : ''}
                value={minioSecretKey}
                onChange={(e) => setMinioSecretKey(e.target.value)}
              />
              <p className="hint">{t('settings.minioSecretKeyHint')}</p>
            </>
          )}

          {tab === 'oauth' && (
            <fieldset disabled={!canEditOauth} className="plain-fieldset">
              {!canEditOauth && <p className="hint">{t('settings.oauth.localAdminOnly')}</p>}

              <label className="checkbox-row">
                <input type="checkbox" checked={oauthEnabled} onChange={(e) => setOauthEnabled(e.target.checked)} />
                {t('settings.oauth.enabled')}
              </label>

              <label className="field-label" htmlFor="settings-oauth-issuer">
                {t('settings.oauth.issuer')}
              </label>
              <input
                id="settings-oauth-issuer"
                type="text"
                placeholder="https://idp.example.com/realms/webtools"
                value={oauthIssuer}
                onChange={(e) => {
                  setOauthIssuer(e.target.value);
                  setTestResult(null);
                }}
              />
              <p className="hint">{t('settings.oauth.issuerHint')}</p>

              <label className="field-label" htmlFor="settings-oauth-client-id">
                {t('settings.oauth.clientId')}
              </label>
              <input
                id="settings-oauth-client-id"
                type="text"
                autoComplete="off"
                value={oauthClientId}
                onChange={(e) => {
                  setOauthClientId(e.target.value);
                  setTestResult(null);
                }}
              />

              <label className="field-label" htmlFor="settings-oauth-client-secret">
                {t('settings.oauth.clientSecret')}
              </label>
              <input
                id="settings-oauth-client-secret"
                type="password"
                autoComplete="new-password"
                placeholder={settings.oauthClientSecretSet ? t('settings.minioSecretKeySetPlaceholder') : ''}
                value={oauthClientSecret}
                onChange={(e) => {
                  setOauthClientSecret(e.target.value);
                  setTestResult(null);
                }}
              />

              <label className="field-label" htmlFor="settings-oauth-scopes">
                {t('settings.oauth.scopes')}
              </label>
              <input
                id="settings-oauth-scopes"
                type="text"
                value={oauthScopes}
                onChange={(e) => setOauthScopes(e.target.value)}
              />

              <label className="field-label" htmlFor="settings-oauth-button-label">
                {t('settings.oauth.buttonLabel')}
              </label>
              <input
                id="settings-oauth-button-label"
                type="text"
                placeholder={t('login.oauthDefault')}
                value={oauthButtonLabel}
                onChange={(e) => setOauthButtonLabel(e.target.value)}
              />

              <label className="field-label">{t('settings.oauth.callbackUrl')}</label>
              <input type="text" readOnly value={callbackUrl} onFocus={(e) => e.target.select()} />
              <p className="hint">{t('settings.oauth.callbackUrlHint')}</p>

              <div className="inline-test-row">
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testing || !oauthIssuer.trim() || !oauthClientId.trim()}
                >
                  {testing ? t('settings.oauth.testing') : t('settings.oauth.testConnection')}
                </button>
                {testResult?.ok && <span className="inline-test-result ok">{t('settings.oauth.testSuccess')}</span>}
                {testResult && !testResult.ok && (
                  <span className="inline-test-result fail">{testResult.message}</span>
                )}
              </div>
            </fieldset>
          )}

          {tab === 'smtp' && (
            <>
              <label className="field-label" htmlFor="settings-smtp-host">
                {t('settings.smtp.host')}
              </label>
              <input
                id="settings-smtp-host"
                type="text"
                placeholder="smtp.example.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />

              <label className="field-label" htmlFor="settings-smtp-port">
                {t('settings.smtp.port')}
              </label>
              <input
                id="settings-smtp-port"
                type="text"
                inputMode="numeric"
                placeholder="587"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
              />

              <label className="checkbox-row">
                <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
                {t('settings.smtp.secure')}
              </label>

              <label className="field-label" htmlFor="settings-smtp-username">
                {t('settings.smtp.username')}
              </label>
              <input
                id="settings-smtp-username"
                type="text"
                autoComplete="off"
                value={smtpUsername}
                onChange={(e) => setSmtpUsername(e.target.value)}
              />

              <label className="field-label" htmlFor="settings-smtp-password">
                {t('settings.smtp.password')}
              </label>
              <input
                id="settings-smtp-password"
                type="password"
                autoComplete="new-password"
                placeholder={settings.smtpPasswordSet ? t('settings.minioSecretKeySetPlaceholder') : ''}
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
              />

              <label className="field-label" htmlFor="settings-smtp-from-name">
                {t('settings.smtp.fromName')}
              </label>
              <input
                id="settings-smtp-from-name"
                type="text"
                placeholder="webtools"
                value={smtpFromName}
                onChange={(e) => setSmtpFromName(e.target.value)}
              />

              <label className="field-label" htmlFor="settings-smtp-from">
                {t('settings.smtp.fromAddress')}
              </label>
              <input
                id="settings-smtp-from"
                type="text"
                placeholder="noreply@example.com"
                value={smtpFromAddress}
                onChange={(e) => setSmtpFromAddress(e.target.value)}
              />
              <p className="hint">{t('settings.smtp.hint')}</p>

              <label className="field-label" htmlFor="settings-smtp-test-recipient">
                {t('settings.smtp.testRecipient')}
              </label>
              <input
                id="settings-smtp-test-recipient"
                type="email"
                placeholder="you@example.com"
                value={smtpTestRecipient}
                onChange={(e) => {
                  setSmtpTestRecipient(e.target.value);
                  setSmtpTestResult(null);
                }}
              />

              <div className="inline-test-row">
                <button
                  type="button"
                  onClick={sendTestEmail}
                  disabled={smtpTesting || !smtpHost.trim() || !smtpTestRecipient.trim()}
                >
                  {smtpTesting ? t('settings.smtp.testing') : t('settings.smtp.testEmail')}
                </button>
                {smtpTestResult?.ok && (
                  <span className="inline-test-result ok">{t('settings.smtp.testSuccess')}</span>
                )}
                {smtpTestResult && !smtpTestResult.ok && (
                  <span className="inline-test-result fail">{smtpTestResult.message}</span>
                )}
              </div>
            </>
          )}

          {error && <p className="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving || (tab === 'oauth' && !canEditOauth)}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
