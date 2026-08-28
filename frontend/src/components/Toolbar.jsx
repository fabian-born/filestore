import { RefreshIcon, SearchIcon, FolderPlusIcon, UploadIcon } from './icons.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export const AUTO_REFRESH_OPTIONS = [
  { value: 0, labelKey: 'toolbar.autoRefreshOff' },
  { value: 10_000, labelKey: 'toolbar.autoRefresh10s' },
  { value: 30_000, labelKey: 'toolbar.autoRefresh30s' },
  { value: 60_000, labelKey: 'toolbar.autoRefresh1m' },
  { value: 300_000, labelKey: 'toolbar.autoRefresh5m' },
];

export default function Toolbar({
  onNewFolder,
  onUploadClick,
  onRefresh,
  uploadProgress,
  searchQuery,
  onSearchChange,
  autoRefreshMs,
  onAutoRefreshChange,
  canWrite = true,
}) {
  const { t } = useSettings();
  return (
    <div className="toolbar">
      <button
        className="toolbar-btn"
        onClick={onNewFolder}
        disabled={!canWrite}
        title={canWrite ? t('toolbar.newFolder') : t('toolbar.readOnlyHint')}
      >
        <FolderPlusIcon />
        <span className="btn-label">{t('toolbar.newFolder')}</span>
      </button>
      <button
        className="toolbar-btn"
        onClick={onUploadClick}
        disabled={!canWrite}
        title={canWrite ? t('toolbar.upload') : t('toolbar.readOnlyHint')}
      >
        <UploadIcon />
        <span className="btn-label">{t('toolbar.upload')}</span>
      </button>
      <div className="search-box">
        <SearchIcon />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('toolbar.searchPlaceholder')}
          aria-label={t('toolbar.searchPlaceholder')}
        />
      </div>
      <button className="icon-btn" onClick={onRefresh} title={t('toolbar.refresh')} aria-label={t('toolbar.refresh')}>
        <RefreshIcon />
      </button>
      <select
        className="auto-refresh-select"
        value={autoRefreshMs}
        onChange={(e) => onAutoRefreshChange(Number(e.target.value))}
        title={t('toolbar.autoRefresh')}
        aria-label={t('toolbar.autoRefresh')}
      >
        {AUTO_REFRESH_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
      {uploadProgress !== null && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
