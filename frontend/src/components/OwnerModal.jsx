import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';

export default function OwnerModal({ items, onClose, onChanged }) {
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

  const hasFolder = items.some((item) => item.isFolder);

  const submit = async (e) => {
    e.preventDefault();
    if (!ownerId) return;
    setSaving(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        items.map((item) => api.changeOwner(item.key, item.isFolder, Number(ownerId)))
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length === items.length) {
        setError(t(`errors.${failed[0].reason?.code}`));
        return;
      }
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={saving ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          {items.length === 1
            ? t('owner.title', { name: items[0].name })
            : t('owner.titleMultiple', { count: items.length })}
        </h2>
        {hasFolder && <p className="hint">{t('owner.recursiveHint')}</p>}

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
