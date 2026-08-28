import { useState } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';

export default function SetupWizard({ onLogout }) {
  const { settings, updateSettings, t } = useSettings();

  const [bucket, setBucket] = useState(settings.bucket || '');
  const [minioUrl, setMinioUrl] = useState(settings.minioUrl || '');
  const [minioAccessKey, setMinioAccessKey] = useState(settings.minioAccessKey || '');
  const [minioSecretKey, setMinioSecretKey] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateSettings({
        bucket: bucket.trim(),
        minioUrl: minioUrl.trim(),
        minioAccessKey: minioAccessKey.trim(),
        minioSecretKey,
      });
    } catch (err) {
      setError(t(`errors.${err.code}`));
      setSaving(false);
    }
  };

  return (
    <div className="wizard-page">
      <form className="wizard-card" onSubmit={save}>
        <div className="wizard-header">
          <h1>{t('wizard.title')}</h1>
          <button type="button" className="logout-btn" onClick={onLogout}>
            {t('nav.logout')}
          </button>
        </div>
        <p className="hint">{t('wizard.intro')}</p>

        <label className="field-label" htmlFor="wizard-bucket">
          {t('settings.bucket')}
        </label>
        <input
          id="wizard-bucket"
          type="text"
          autoFocus
          placeholder="webtools"
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          required
        />
        <p className="hint">{t('settings.bucketHint')}</p>

        <label className="field-label" htmlFor="wizard-minio-url">
          {t('settings.minioUrl')}
        </label>
        <input
          id="wizard-minio-url"
          type="text"
          placeholder="https://minio.example.com:9000"
          value={minioUrl}
          onChange={(e) => setMinioUrl(e.target.value)}
          required
        />
        <p className="hint">{t('settings.minioUrlHint')}</p>

        <label className="field-label" htmlFor="wizard-minio-access-key">
          {t('settings.minioAccessKey')}
        </label>
        <input
          id="wizard-minio-access-key"
          type="text"
          autoComplete="off"
          value={minioAccessKey}
          onChange={(e) => setMinioAccessKey(e.target.value)}
          required
        />

        <label className="field-label" htmlFor="wizard-minio-secret-key">
          {t('settings.minioSecretKey')}
        </label>
        <input
          id="wizard-minio-secret-key"
          type="password"
          autoComplete="new-password"
          value={minioSecretKey}
          onChange={(e) => setMinioSecretKey(e.target.value)}
          required
        />

        {error && <p className="alert">{error}</p>}

        <button type="submit" disabled={saving}>
          {saving ? t('common.saving') : t('wizard.submit')}
        </button>
      </form>
    </div>
  );
}
