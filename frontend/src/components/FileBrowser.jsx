import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api.js';
import Breadcrumb from './Breadcrumb.jsx';
import Toolbar from './Toolbar.jsx';
import FileList from './FileList.jsx';
import NewFolderModal from './NewFolderModal.jsx';
import ShareModal from './ShareModal.jsx';
import RenameModal from './RenameModal.jsx';
import DeleteFolderModal from './DeleteFolderModal.jsx';
import SettingsModal from './SettingsModal.jsx';
import ProfileModal from './ProfileModal.jsx';
import MoveModal from './MoveModal.jsx';
import Pagination from './Pagination.jsx';
import { SettingsIcon, ProfileIcon, ActivityIcon, StatsIcon } from './icons.jsx';
import QuotaFooter from './QuotaFooter.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import logo from '../assets/filestore_logo.png';

export default function FileBrowser({ onLogout, onUnauthorized, onOpenActivity, onOpenStats, user }) {
  const { t } = useSettings();
  const [prefix, setPrefix] = useState('');
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [shareKey, setShareKey] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState(null);
  const [moveItems, setMoveItems] = useState(null);
  const [selected, setSelected] = useState(new Map());
  const [uploadProgress, setUploadProgress] = useState(null);
  const [renamedNotice, setRenamedNotice] = useState(null);
  const [quotaNotice, setQuotaNotice] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [autoRefreshMs, setAutoRefreshMs] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const fileInputRef = useRef(null);
  const isSearching = searchQuery.trim().length > 0;
  const pageOffset = pageSize === 'all' ? 0 : page * pageSize;

  const handleSort = (field) => {
    if (field === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  useEffect(() => {
    document.title = t('app.title');
  }, [t]);

  const handleError = useCallback(
    (err) => {
      if (err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(t(`errors.${err.code}`));
    },
    [onUnauthorized, t]
  );

  // Stable (don't depend on page/pageSize/prefix) - callers always pass the
  // page params explicitly, which keeps the effects below simple instead of
  // re-triggering every time just because these functions were re-created.
  const load = useCallback(
    async (p, ps, off, sBy, sDir) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.browse(p, ps, off, sBy, sDir);
        // The current page emptied out from under us (e.g. the last item on
        // the last page got deleted) - snap back to the new last page
        // instead of showing a stuck-empty page.
        if (ps !== 'all' && data.total > 0 && off >= data.total) {
          setPage(Math.max(0, Math.ceil(data.total / ps) - 1));
          return;
        }
        setFolders(data.folders);
        setFiles(data.files);
        setTotal(data.total);
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  useEffect(() => {
    if (isSearching) return;
    load(prefix, pageSize, pageOffset, sortBy, sortDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, pageSize, page, sortBy, sortDir, isSearching, load]);

  const runSearch = useCallback(
    async (query, ps, off, sBy, sDir) => {
      setSearchLoading(true);
      try {
        const data = await api.search(query, ps, off, sBy, sDir);
        if (ps !== 'all' && data.total > 0 && off >= data.total) {
          setPage(Math.max(0, Math.ceil(data.total / ps) - 1));
          return;
        }
        setSearchResults(data);
      } catch (err) {
        setSearchResults({ folders: [], files: [], total: 0 });
        handleError(err);
      } finally {
        setSearchLoading(false);
      }
    },
    [handleError]
  );

  // A new search term (or toggling search on/off, or changing the page
  // size/sort) always restarts at page 1.
  useEffect(() => {
    setPage(0);
  }, [prefix, pageSize, searchQuery, sortBy, sortDir]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    const handle = setTimeout(() => runSearch(query, pageSize, pageOffset, sortBy, sortDir), 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, pageSize, page, sortBy, sortDir, runSearch]);

  useEffect(() => {
    if (!autoRefreshMs) return;
    const interval = setInterval(() => {
      const query = searchQuery.trim();
      if (query) runSearch(query, pageSize, pageOffset, sortBy, sortDir);
      else load(prefix, pageSize, pageOffset, sortBy, sortDir);
    }, autoRefreshMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshMs, searchQuery, prefix, pageSize, page, sortBy, sortDir, load, runSearch]);

  const handleOpenFolder = (key) => {
    setSearchQuery('');
    setPrefix(key);
  };

  // Selection is scoped to what's currently listed - switching folders,
  // pages, or toggling search leaves stale, invisible selections behind
  // otherwise.
  useEffect(() => {
    setSelected(new Map());
  }, [prefix, isSearching, page, pageSize]);

  const toggleSelect = (item) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.set(item.key, item);
      return next;
    });
  };

  const toggleSelectAll = (items) => {
    setSelected((prev) => {
      const allSelected = items.length > 0 && items.every((it) => prev.has(it.key));
      if (allSelected) return new Map();
      const next = new Map();
      items.forEach((it) => next.set(it.key, it));
      return next;
    });
  };

  // The root listing is a synthetic view (own folder + shared folder) for
  // non-admins, not a real writable location.
  const canWrite = Boolean(user?.isAdmin) || prefix !== '';

  // Re-fetches whatever's currently on screen (browse or search, same page)
  // - the one thing every mutation below needs afterwards.
  const refresh = useCallback(() => {
    if (isSearching) return runSearch(searchQuery.trim(), pageSize, pageOffset, sortBy, sortDir);
    return load(prefix, pageSize, pageOffset, sortBy, sortDir);
  }, [isSearching, searchQuery, pageSize, pageOffset, sortBy, sortDir, prefix, load, runSearch]);

  const handleUpload = async (fileList) => {
    if (!canWrite || !fileList || !fileList.length) return;
    setUploadProgress(0);
    setRenamedNotice(null);
    setQuotaNotice(false);
    try {
      const result = await api.uploadFiles(prefix, fileList, setUploadProgress);
      await refresh();
      if (result?.renamed?.length) setRenamedNotice(result.renamed);
      if (result?.quotaExceeded) setQuotaNotice(true);
    } catch (err) {
      handleError(err);
    } finally {
      setUploadProgress(null);
    }
  };

  const handleCreateFolder = async (name) => {
    if (!canWrite) return;
    await api.createFolder(prefix, name);
    setShowNewFolder(false);
    await refresh();
  };

  const handleDelete = async (item) => {
    if (item.isFolder) {
      setDeleteFolderTarget(item);
      return;
    }
    if (!window.confirm(t('deleteFile.confirm', { name: item.name }))) return;
    try {
      await api.deleteObject(item.key, false);
      await refresh();
    } catch (err) {
      handleError(err);
    }
  };

  const handleRename = async (newName) => {
    await api.renameObject(renameTarget.key, renameTarget.isFolder, newName);
    setRenameTarget(null);
    refresh();
  };

  const confirmDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    try {
      await api.deleteObject(deleteFolderTarget.key, true);
      setDeleteFolderTarget(null);
      await refresh();
    } catch (err) {
      setDeleteFolderTarget(null);
      handleError(err);
    }
  };

  // Non-admins never see the literal "users/" storage segment: their home
  // folder's breadcrumb starts directly at their username.
  const stripUsersSegment = !user?.isAdmin && prefix.startsWith('users/');
  const displayPrefix = stripUsersSegment ? prefix.slice('users/'.length) : prefix;
  const crumbs = prefix
    ? ['', ...displayPrefix.replace(/\/$/, '').split('/')].map((seg, i, arr) => {
        const relPath = arr.slice(1, i + 1).join('/');
        const navPrefix = relPath ? `${stripUsersSegment ? 'users/' : ''}${relPath}/` : '';
        return { name: seg, isHome: i === 0, prefix: navPrefix };
      })
    : [{ name: '', isHome: true, prefix: '' }];

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <img src={logo} alt="Filestore" className="app-logo" />
        </div>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={onOpenStats}
            title={t('stats.title')}
            aria-label={t('stats.title')}
          >
            <StatsIcon />
          </button>
          <button
            className="icon-btn"
            onClick={onOpenActivity}
            title={t('activity.title')}
            aria-label={t('activity.title')}
          >
            <ActivityIcon />
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowProfile(true)}
            title={t('profile.title')}
            aria-label={t('profile.title')}
          >
            <ProfileIcon />
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            title={t('settings.title')}
            aria-label={t('settings.title')}
          >
            <SettingsIcon />
          </button>
          <button className="logout-btn" onClick={onLogout}>
            {t('nav.logout')}
          </button>
        </div>
      </header>

      <Breadcrumb crumbs={crumbs} onNavigate={handleOpenFolder} />

      <Toolbar
        onNewFolder={() => setShowNewFolder(true)}
        onUploadClick={() => fileInputRef.current?.click()}
        onRefresh={refresh}
        uploadProgress={uploadProgress}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        autoRefreshMs={autoRefreshMs}
        onAutoRefreshChange={setAutoRefreshMs}
        canWrite={canWrite}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          handleUpload(e.target.files);
          e.target.value = '';
        }}
      />

      {error && <div className="alert">{error}</div>}

      {renamedNotice && (
        <div className="notice">
          {renamedNotice.map((r) => (
            <p key={r.saved}>{t('upload.renamed', { original: r.original, saved: r.saved })}</p>
          ))}
          <button type="button" className="link" onClick={() => setRenamedNotice(null)}>
            {t('common.close')}
          </button>
        </div>
      )}

      {quotaNotice && (
        <div className="notice warn">
          <p>{t('quota.uploadPartial')}</p>
          <button type="button" className="link" onClick={() => setQuotaNotice(false)}>
            {t('common.close')}
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="selection-bar">
          <span>{t('selection.count', { count: selected.size })}</span>
          <button type="button" onClick={() => setMoveItems(Array.from(selected.values()))}>
            {t('selection.move')}
          </button>
          <button type="button" onClick={() => setSelected(new Map())}>
            {t('selection.clear')}
          </button>
        </div>
      )}

      <FileList
        loading={isSearching ? searchLoading : loading}
        folders={isSearching ? searchResults?.folders || [] : folders}
        files={isSearching ? searchResults?.files || [] : files}
        onOpenFolder={handleOpenFolder}
        onDelete={handleDelete}
        onShare={setShareKey}
        onMove={(item) => setMoveItems([item])}
        onRename={setRenameTarget}
        onDropFiles={handleUpload}
        pathMode={isSearching}
        showMove={Boolean(user?.isAdmin)}
        selectedKeys={selected}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        emptyMessage={isSearching ? t('fileList.noResults') : undefined}
        loadingMessage={isSearching ? t('fileList.searching') : undefined}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={handleSort}
      />

      <div className="pagination-row">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={isSearching ? searchResults?.total || 0 : total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />

        <QuotaFooter refreshKey={total} />
      </div>

      {showNewFolder && (
        <NewFolderModal onCreate={handleCreateFolder} onClose={() => setShowNewFolder(false)} />
      )}

      {shareKey && (
        <ShareModal
          fileKey={shareKey}
          onClose={() => {
            setShareKey(null);
            refresh();
          }}
        />
      )}

      {renameTarget && (
        <RenameModal item={renameTarget} onRename={handleRename} onClose={() => setRenameTarget(null)} />
      )}

      {deleteFolderTarget && (
        <DeleteFolderModal
          folder={deleteFolderTarget}
          onConfirm={confirmDeleteFolder}
          onClose={() => setDeleteFolderTarget(null)}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} user={user} />}

      {showProfile && <ProfileModal user={user} onClose={() => setShowProfile(false)} />}

      {moveItems && (
        <MoveModal
          items={moveItems}
          onClose={() => setMoveItems(null)}
          onMoved={() => {
            setMoveItems(null);
            setSelected(new Map());
            refresh();
          }}
        />
      )}
    </div>
  );
}
