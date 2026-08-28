import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';

export default function ProfileModal({ user, onClose }) {
  const { t } = useSettings();
  const isOauth = user?.authMethod === 'oauth';

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const [detailsSuccess, setDetailsSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // The `user` prop can be stale (App.jsx only refreshes it on login) - fetch
  // fresh values on open so a previous edit or an OAuth login-time sync
  // actually shows up here.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((data) => {
        if (cancelled) return;
        setFirstName(data.firstName || '');
        setLastName(data.lastName || '');
        setEmail(data.email || '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const submitDetails = async (e) => {
    e.preventDefault();
    setDetailsError(null);
    setDetailsSuccess(false);
    setDetailsSaving(true);
    try {
      const data = await api.updateProfileDetails({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      });
      setFirstName(data.firstName);
      setLastName(data.lastName);
      setEmail(data.email);
      setDetailsSuccess(true);
    } catch (err) {
      setDetailsError(t(`errors.${err.code}`));
    } finally {
      setDetailsSaving(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(t('profile.tooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('profile.mismatch'));
      return;
    }

    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(t(`errors.${err.code}`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('profile.title')}</h2>
        {user?.username && <p className="hint">{user.username}</p>}

        <form onSubmit={submitDetails}>
          <fieldset disabled={isOauth} className="plain-fieldset">
            <label className="field-label" htmlFor="profile-first-name">
              {t('profile.firstName')}
            </label>
            <input
              id="profile-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />

            <label className="field-label" htmlFor="profile-last-name">
              {t('profile.lastName')}
            </label>
            <input
              id="profile-last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />

            <label className="field-label" htmlFor="profile-email">
              {t('profile.email')}
            </label>
            <input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </fieldset>

          {isOauth && <p className="hint">{t('profile.oauthManaged')}</p>}
          {detailsError && <p className="alert">{detailsError}</p>}
          {detailsSuccess && <p className="hint success">{t('profile.detailsSuccess')}</p>}

          {!isOauth && (
            <div className="modal-actions">
              <button type="submit" disabled={detailsSaving}>
                {detailsSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          )}
        </form>

        {!isOauth && (
          <form className="inline-form" onSubmit={submit}>
            <label className="field-label" htmlFor="profile-current-password">
              {t('profile.currentPassword')}
            </label>
            <input
              id="profile-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />

            <label className="field-label" htmlFor="profile-new-password">
              {t('profile.newPassword')}
            </label>
            <input
              id="profile-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />

            <label className="field-label" htmlFor="profile-confirm-password">
              {t('profile.confirmPassword')}
            </label>
            <input
              id="profile-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            {error && <p className="alert">{error}</p>}
            {success && <p className="hint success">{t('profile.success')}</p>}

            <div className="modal-actions">
              <button type="submit" disabled={saving}>
                {saving ? t('profile.submitting') : t('profile.submit')}
              </button>
            </div>
          </form>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
