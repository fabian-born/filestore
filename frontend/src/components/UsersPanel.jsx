import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { DeleteIcon } from './icons.jsx';

export default function UsersPanel({ currentUserId }) {
  const { t } = useSettings();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [adding, setAdding] = useState(false);

  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .listUsers()
      .then((data) => setUsers(data.users))
      .catch((err) => setError(t(`errors.${err.code}`)))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError(t('profile.tooShort'));
      return;
    }
    setAdding(true);
    try {
      await api.createUser(newUsername.trim(), newPassword, newIsAdmin);
      setNewUsername('');
      setNewPassword('');
      setNewIsAdmin(false);
      await load();
    } catch (err) {
      setError(t(`errors.${err.code}`));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(t('users.confirmDelete', { username: user.username }))) return;
    setError(null);
    try {
      await api.deleteUser(user.id);
      await load();
    } catch (err) {
      setError(t(`errors.${err.code}`));
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPassword.length < 8) {
      setError(t('profile.tooShort'));
      return;
    }
    setResetting(true);
    setError(null);
    try {
      await api.resetUserPassword(resetTarget.id, resetPassword);
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      setError(t(`errors.${err.code}`));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="users-panel">
      {error && <p className="alert">{error}</p>}

      {loading ? (
        <p className="hint">{t('fileList.loading')}</p>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>{t('users.username')}</th>
              <th>{t('users.role')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.username}
                  {u.id === currentUserId && <span className="badge">{t('users.you')}</span>}
                </td>
                <td>{u.isAdmin ? t('users.admin') : t('users.member')}</td>
                <td className="users-row-actions">
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setResetTarget(u);
                      setResetPassword('');
                      setError(null);
                    }}
                  >
                    {t('users.resetPassword')}
                  </button>
                  {u.id !== currentUserId && (
                    <button
                      type="button"
                      className="icon-btn"
                      title={t('users.delete')}
                      aria-label={t('users.delete')}
                      onClick={() => handleDelete(u)}
                    >
                      <DeleteIcon />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {resetTarget && (
        <form className="inline-form" onSubmit={handleReset}>
          <label className="field-label" htmlFor="reset-password">
            {t('users.resetPasswordFor', { username: resetTarget.username })}
          </label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            required
          />
          <div className="modal-actions">
            <button type="button" onClick={() => setResetTarget(null)} disabled={resetting}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={resetting}>
              {resetting ? t('users.resetting') : t('users.reset')}
            </button>
          </div>
        </form>
      )}

      <form className="inline-form add-user-form" onSubmit={handleAdd}>
        <label className="field-label" htmlFor="new-username">
          {t('users.addUser')}
        </label>
        <input
          id="new-username"
          type="text"
          autoComplete="off"
          placeholder={t('users.username')}
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          required
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder={t('users.password')}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <label className="checkbox-row">
          <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />
          {t('users.isAdmin')}
        </label>
        <div className="modal-actions">
          <button type="submit" disabled={adding}>
            {adding ? t('users.adding') : t('users.add')}
          </button>
        </div>
      </form>
    </div>
  );
}
