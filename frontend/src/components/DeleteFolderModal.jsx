import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';

export default function DeleteFolderModal({ folder, onConfirm, onClose }) {
  const { t } = useSettings();
  const [count, setCount] = useState(null);
  const [error, setError] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .countFolderFiles(folder.key)
      .then((data) => setCount(data.count))
      .catch((err) => setError(t(`errors.${err.code}`)));
  }, [folder.key]);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  const loading = count === null && !error;
  const isEmpty = count === 0;
  const canConfirm = !loading && !error && !deleting && (isEmpty || accepted);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('deleteFolder.title')}</h2>
        {error && <p className="alert">{error}</p>}
        {loading && <p className="hint">{t('deleteFolder.checking')}</p>}

        {!loading && !error && isEmpty && <p>{t('deleteFolder.empty', { name: folder.name })}</p>}

        {!loading && !error && !isEmpty && (
          <>
            <p className="alert">
              {t('deleteFolder.warning', {
                name: folder.name,
                count,
                unit: t(count === 1 ? 'deleteFolder.unitSingular' : 'deleteFolder.unitPlural'),
              })}
            </p>
            <label className="checkbox-row">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              {t('deleteFolder.accept')}
            </label>
          </>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-danger" onClick={handleConfirm} disabled={!canConfirm}>
            {deleting ? t('common.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
