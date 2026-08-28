import { useState } from 'react';
import { ShareIcon, DeleteIcon, MoveIcon, RenameIcon, InfoIcon, MenuIcon, ProfileIcon } from './icons.jsx';
import Popover from './Popover.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { formatBytes } from '../format.js';

const LOCALES = { de: 'de-DE', en: 'en-US' };

function MenuItem({ icon, label, className = '', onClick }) {
  return (
    <button type="button" className={`popover-menu-item ${className}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SortHeader({ field, label, sortBy, sortDir, onSort }) {
  const active = sortBy === field;
  return (
    <th>
      <button type="button" className="sort-header" onClick={() => onSort(field)}>
        {label}
        <span className={`sort-arrow ${active ? 'active' : ''}`}>{active && sortDir === 'desc' ? '▼' : '▲'}</span>
      </button>
    </th>
  );
}

export default function FileList({
  loading,
  folders,
  files,
  onOpenFolder,
  onDelete,
  onShare,
  onMove,
  onChangeOwner,
  onRename,
  onDropFiles,
  pathMode,
  showMove,
  selectedKeys,
  onToggleSelect,
  onToggleSelectAll,
  emptyMessage,
  loadingMessage,
  sortBy,
  sortDir,
  onSort,
}) {
  const { t, settings } = useSettings();
  const [dragOver, setDragOver] = useState(false);
  const locale = LOCALES[settings.language] || LOCALES.de;

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    onDropFiles(e.dataTransfer.files);
  };

  const isEmpty = !loading && folders.length === 0 && files.length === 0;
  const allItems = [
    ...folders.map((f) => ({ key: f.key, name: f.name, isFolder: true })),
    ...files.map((f) => ({ key: f.key, name: f.name, isFolder: false })),
  ];
  const allSelected = showMove && allItems.length > 0 && allItems.every((it) => selectedKeys?.has(it.key));

  return (
    <div
      className={`file-list ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {loading && <p className="hint">{loadingMessage || t('fileList.loading')}</p>}
      {isEmpty && <p className="hint">{emptyMessage || t('fileList.empty')}</p>}

      {!loading && (folders.length > 0 || files.length > 0) && (
        <table>
          <thead>
            <tr>
              {showMove && (
                <th className="select-col">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => onToggleSelectAll(allItems)}
                    aria-label={t('fileList.selectAll')}
                  />
                </th>
              )}
              <SortHeader field="name" label={t('fileList.name')} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader field="size" label={t('fileList.size')} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader
                field="modified"
                label={t('fileList.modified')}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={onSort}
              />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {folders.map((f) => (
              <tr key={f.key}>
                {showMove && (
                  <td className="select-col">
                    <input
                      type="checkbox"
                      checked={selectedKeys?.has(f.key) || false}
                      onChange={() => onToggleSelect({ key: f.key, name: f.name, isFolder: true })}
                      aria-label={t('fileList.select', { name: f.name })}
                    />
                  </td>
                )}
                <td>
                  <button className="link" onClick={() => onOpenFolder(f.key)}>
                    📁 {pathMode ? f.key.replace(/\/$/, '') : f.name}
                  </button>
                  {f.orphaned && (
                    <span className="badge warn" title={t('fileList.orphanedHint')}>
                      {t('fileList.orphanedBadge')}
                    </span>
                  )}
                  {f.orphaned && showMove && (
                    <button
                      type="button"
                      className="badge warn badge-button"
                      onClick={() => onChangeOwner({ key: f.key, name: f.name, isFolder: true })}
                    >
                      {t('fileList.reassignContent')}
                    </button>
                  )}
                </td>
                <td>—</td>
                <td>—</td>
                <td>
                  <span className="row-actions-desktop">
                    {showMove && (
                      <button
                        className="icon-btn"
                        title={t('fileList.move')}
                        aria-label={t('fileList.move')}
                        onClick={() => onMove({ key: f.key, name: f.name, isFolder: true })}
                      >
                        <MoveIcon />
                      </button>
                    )}
                    {showMove && (
                      <button
                        className="icon-btn"
                        title={t('fileList.changeOwner')}
                        aria-label={t('fileList.changeOwner')}
                        onClick={() => onChangeOwner({ key: f.key, name: f.name, isFolder: true })}
                      >
                        <ProfileIcon />
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      title={t('fileList.rename')}
                      aria-label={t('fileList.rename')}
                      onClick={() => onRename({ key: f.key, name: f.name, isFolder: true })}
                    >
                      <RenameIcon />
                    </button>
                    <button
                      className="icon-btn"
                      title={t('fileList.delete')}
                      aria-label={t('fileList.delete')}
                      onClick={() => onDelete({ key: f.key, name: f.name, isFolder: true })}
                    >
                      <DeleteIcon />
                    </button>
                  </span>

                  <span className="row-actions-mobile">
                    <Popover
                      triggerClassName="icon-btn"
                      triggerProps={{ title: t('fileList.actions'), 'aria-label': t('fileList.actions') }}
                      trigger={<MenuIcon />}
                    >
                      {({ close }) => (
                        <>
                          {showMove && (
                            <MenuItem
                              icon={<MoveIcon />}
                              label={t('fileList.move')}
                              onClick={() => {
                                close();
                                onMove({ key: f.key, name: f.name, isFolder: true });
                              }}
                            />
                          )}
                          {showMove && (
                            <MenuItem
                              icon={<ProfileIcon />}
                              label={t('fileList.changeOwner')}
                              onClick={() => {
                                close();
                                onChangeOwner({ key: f.key, name: f.name, isFolder: true });
                              }}
                            />
                          )}
                          <MenuItem
                            icon={<RenameIcon />}
                            label={t('fileList.rename')}
                            onClick={() => {
                              close();
                              onRename({ key: f.key, name: f.name, isFolder: true });
                            }}
                          />
                          <MenuItem
                            icon={<DeleteIcon />}
                            label={t('fileList.delete')}
                            className="danger"
                            onClick={() => {
                              close();
                              onDelete({ key: f.key, name: f.name, isFolder: true });
                            }}
                          />
                        </>
                      )}
                    </Popover>
                  </span>
                </td>
              </tr>
            ))}
            {files.map((f) => (
              <tr key={f.key}>
                {showMove && (
                  <td className="select-col">
                    <input
                      type="checkbox"
                      checked={selectedKeys?.has(f.key) || false}
                      onChange={() => onToggleSelect({ key: f.key, name: f.name, isFolder: false })}
                      aria-label={t('fileList.select', { name: f.name })}
                    />
                  </td>
                )}
                <td>📄 {pathMode ? f.key : f.name}</td>
                <td>{formatBytes(f.size)}</td>
                <td>{new Date(f.lastModified).toLocaleString(locale)}</td>
                <td>
                  <span className="row-actions-desktop">
                    <Popover
                      triggerClassName="icon-btn"
                      triggerProps={{ title: t('fileList.info'), 'aria-label': t('fileList.info') }}
                      trigger={<InfoIcon />}
                    >
                      <div className="popover-info">
                        {f.owner ? (
                          <p>
                            <span className="popover-info-label">{t('fileList.owner')}</span>
                            {f.owner}
                          </p>
                        ) : (
                          <p className="hint">{t('fileList.noInfo')}</p>
                        )}
                      </div>
                    </Popover>
                    {showMove && (
                      <button
                        className="icon-btn"
                        title={t('fileList.move')}
                        aria-label={t('fileList.move')}
                        onClick={() => onMove({ key: f.key, name: f.name, isFolder: false })}
                      >
                        <MoveIcon />
                      </button>
                    )}
                    {showMove && (
                      <button
                        className="icon-btn"
                        title={t('fileList.changeOwner')}
                        aria-label={t('fileList.changeOwner')}
                        onClick={() => onChangeOwner({ key: f.key, name: f.name, isFolder: false })}
                      >
                        <ProfileIcon />
                      </button>
                    )}
                    <button
                      className={`icon-btn ${f.shared ? 'shared' : ''}`}
                      title={f.shared ? t('fileList.shared') : t('fileList.share')}
                      aria-label={f.shared ? t('fileList.shared') : t('fileList.share')}
                      onClick={() => onShare(f.key)}
                    >
                      <ShareIcon />
                    </button>
                    <button
                      className="icon-btn"
                      title={t('fileList.rename')}
                      aria-label={t('fileList.rename')}
                      onClick={() => onRename({ key: f.key, name: f.name, isFolder: false })}
                    >
                      <RenameIcon />
                    </button>
                    <button
                      className="icon-btn"
                      title={t('fileList.delete')}
                      aria-label={t('fileList.delete')}
                      onClick={() => onDelete({ key: f.key, name: f.name, isFolder: false })}
                    >
                      <DeleteIcon />
                    </button>
                  </span>

                  <span className="row-actions-mobile">
                    <Popover
                      triggerClassName="icon-btn"
                      triggerProps={{ title: t('fileList.info'), 'aria-label': t('fileList.info') }}
                      trigger={<InfoIcon />}
                    >
                      <div className="popover-info">
                        <p>
                          <span className="popover-info-label">{t('fileList.size')}</span>
                          {formatBytes(f.size)}
                        </p>
                        <p>
                          <span className="popover-info-label">{t('fileList.modified')}</span>
                          {new Date(f.lastModified).toLocaleString(locale)}
                        </p>
                        {f.owner && (
                          <p>
                            <span className="popover-info-label">{t('fileList.owner')}</span>
                            {f.owner}
                          </p>
                        )}
                      </div>
                    </Popover>
                    <Popover
                      triggerClassName={`icon-btn ${f.shared ? 'shared' : ''}`}
                      triggerProps={{
                        title: f.shared ? t('fileList.shared') : t('fileList.actions'),
                        'aria-label': f.shared ? t('fileList.shared') : t('fileList.actions'),
                      }}
                      trigger={<MenuIcon />}
                    >
                      {({ close }) => (
                        <>
                          {showMove && (
                            <MenuItem
                              icon={<MoveIcon />}
                              label={t('fileList.move')}
                              onClick={() => {
                                close();
                                onMove({ key: f.key, name: f.name, isFolder: false });
                              }}
                            />
                          )}
                          {showMove && (
                            <MenuItem
                              icon={<ProfileIcon />}
                              label={t('fileList.changeOwner')}
                              onClick={() => {
                                close();
                                onChangeOwner({ key: f.key, name: f.name, isFolder: false });
                              }}
                            />
                          )}
                          <MenuItem
                            icon={<ShareIcon />}
                            label={f.shared ? t('fileList.shared') : t('fileList.share')}
                            className={f.shared ? 'shared' : ''}
                            onClick={() => {
                              close();
                              onShare(f.key);
                            }}
                          />
                          <MenuItem
                            icon={<RenameIcon />}
                            label={t('fileList.rename')}
                            onClick={() => {
                              close();
                              onRename({ key: f.key, name: f.name, isFolder: false });
                            }}
                          />
                          <MenuItem
                            icon={<DeleteIcon />}
                            label={t('fileList.delete')}
                            className="danger"
                            onClick={() => {
                              close();
                              onDelete({ key: f.key, name: f.name, isFolder: false });
                            }}
                          />
                        </>
                      )}
                    </Popover>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
