import { useState } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';

export default function NewFolderModal({ onCreate, onClose }) {
  const { t } = useSettings();
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('newFolder.nameRequired'));
      return;
    }
    if (name.includes('/')) {
      setError(t('newFolder.nameInvalid'));
      return;
    }
    setBusy(true);
    try {
      await onCreate(name.trim());
    } catch (err) {
      setError(t(`errors.${err.code}`));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('newFolder.title')}</h2>
        <form onSubmit={submit}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('newFolder.placeholder')}
          />
          {error && <p className="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={busy}>
              {t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
