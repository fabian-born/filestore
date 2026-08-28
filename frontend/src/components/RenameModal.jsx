import { useState } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';

export default function RenameModal({ item, onRename, onClose }) {
  const { t } = useSettings();
  const [name, setName] = useState(item.name);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('rename.nameRequired'));
      return;
    }
    if (name.includes('/')) {
      setError(t('rename.nameInvalid'));
      return;
    }
    if (name.trim() === item.name) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRename(name.trim());
    } catch (err) {
      setError(t(`errors.${err.code}`));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('rename.title', { name: item.name })}</h2>
        <form onSubmit={submit}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          {error && <p className="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={busy}>
              {busy ? t('rename.renaming') : t('rename.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
