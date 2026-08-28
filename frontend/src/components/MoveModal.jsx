import { useEffect, useRef, useState } from 'react';
import * as api from '../api.js';
import Breadcrumb from './Breadcrumb.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function MoveModal({ items, onClose, onMoved }) {
  const { t } = useSettings();
  const [destPrefix, setDestPrefix] = useState('');
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(null);
  const pollRef = useRef(null);

  const load = async (prefix) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.browse(prefix);
      setFolders(data.folders);
      setDestPrefix(prefix);
    } catch (err) {
      setError(t(`errors.${err.code}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('');
  }, []);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const startMove = async () => {
    setStarting(true);
    setError(null);
    try {
      const { jobId: id } = await api.moveObjects(items, destPrefix);
      setJobId(id);
      setProgress({ moved: 0, total: null });
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.getMoveStatus(id);
          setProgress({ moved: status.moved, total: status.total });
          if (status.status === 'done') {
            clearInterval(pollRef.current);
            onMoved();
          } else if (status.status === 'error') {
            clearInterval(pollRef.current);
            setStarting(false);
            setJobId(null);
            setError(t(`errors.${status.error}`));
          }
        } catch (err) {
          clearInterval(pollRef.current);
          setStarting(false);
          setJobId(null);
          setError(t(`errors.${err.code}`));
        }
      }, 400);
    } catch (err) {
      setStarting(false);
      setError(t(`errors.${err.code}`));
    }
  };

  const crumbs = destPrefix
    ? ['', ...destPrefix.replace(/\/$/, '').split('/')].map((seg, i, arr) => {
        const path = arr.slice(1, i + 1).join('/');
        return { name: seg, isHome: i === 0, prefix: path ? `${path}/` : '' };
      })
    : [{ name: '', isHome: true, prefix: '' }];

  const busy = starting || Boolean(jobId);
  const percent = progress?.total ? Math.round((progress.moved / progress.total) * 100) : null;

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{items.length === 1 ? t('move.title', { name: items[0].name }) : t('move.titleMultiple', { count: items.length })}</h2>

        {!jobId && (
          <>
            <Breadcrumb crumbs={crumbs} onNavigate={load} />
            {loading ? (
              <p className="hint">{t('fileList.loading')}</p>
            ) : (
              <ul className="move-folder-list">
                {folders.map((f) => (
                  <li key={f.key}>
                    <button type="button" className="link" onClick={() => load(f.key)}>
                      📁 {f.name}
                    </button>
                  </li>
                ))}
                {folders.length === 0 && <li className="hint">{t('move.empty')}</li>}
              </ul>
            )}
          </>
        )}

        {progress && (
          <div className="move-progress">
            <div className="progress">
              <div className="progress-bar" style={{ width: `${percent ?? 100}%` }} />
            </div>
            <p className="hint">
              {progress.total ? t('move.progress', { moved: progress.moved, total: progress.total }) : t('move.starting')}
            </p>
          </div>
        )}

        {error && <p className="alert">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          {!jobId && (
            <button type="button" onClick={startMove} disabled={busy || loading}>
              {starting ? t('move.starting') : t('move.moveHere')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
