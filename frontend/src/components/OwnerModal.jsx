import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';

export default function OwnerModal({ item, onClose, onChanged }) {
  const { t } = useSettings();
  const [users, setUsers] = useState([]);
  const [ownerId, setOwnerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .listUsers()
      .then((data) => setUsers(data.users))
      .catch((err) => setError(t(`errors.${err.code}`)));
  }, [t]);

  const submit = async (e) => {
    e.preventDefault();
    if (!ownerId) return;
    setSaving(true);
    setError(null);
    try {
      await api.changeOwner(item.key, item.isFolder, Number(ownerId));
      onChanged();
    } catch (err) {
      setError(t(`errors.${err.code}`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('owner.title', { name: item.name })}</h2>
        {item.isFolder && <p className="hint">{t('owner.recursiveHint')}</p>}

        <form onSubmit={submit}>
          <label className="field-label" htmlFor="owner-select">
            {t('owner.select')}
          </label>
          <select id="owner-select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required>
            <option value="" disabled>
              {t('owner.choose')}
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>

          {error && <p className="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving || !ownerId}>
              {saving ? t('common.saving') : t('owner.change')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
