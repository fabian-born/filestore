const BASE = '/api';

let unauthorizedHandler = null;

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = body.error || 'GENERIC';
    const err = new Error(code);
    err.status = res.status;
    err.code = code;
    if (res.status === 401) unauthorizedHandler?.();
    throw err;
  }
  return res.json();
}

export function login(username, password) {
  return request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return request('/logout', { method: 'POST' });
}

export function me() {
  return request('/me');
}

export function browse(prefix, limit, offset, sortBy, sortDir) {
  return request(
    `/browse?prefix=${encodeURIComponent(prefix)}&limit=${limit}&offset=${offset}&sortBy=${sortBy}&sortDir=${sortDir}`
  );
}

export function createFolder(prefix, name) {
  return request('/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, name }),
  });
}

export function countFolderFiles(prefix) {
  return request(`/folders/count?prefix=${encodeURIComponent(prefix)}`);
}

export function search(query, limit, offset, sortBy, sortDir) {
  return request(
    `/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&sortBy=${sortBy}&sortDir=${sortDir}`
  );
}

export function changePassword(currentPassword, newPassword) {
  return request('/profile/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function updateProfileDetails(partial) {
  return request('/profile/details', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
}

export function listUsers() {
  return request('/users');
}

export function createUser(username, password, isAdmin) {
  return request('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, isAdmin }),
  });
}

export function resetUserPassword(id, password) {
  return request(`/users/${id}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export function deleteUser(id) {
  return request(`/users/${id}`, { method: 'DELETE' });
}

export function moveObjects(items, destPrefix) {
  return request('/admin/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: items.map(({ key, isFolder }) => ({ key, isFolder })),
      destPrefix,
    }),
  });
}

export function getMoveStatus(jobId) {
  return request(`/admin/move/${jobId}`);
}

export function renameObject(key, isFolder, newName) {
  return request('/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, isFolder, newName }),
  });
}

export function deleteObject(key, isFolder) {
  return request('/objects', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, isFolder }),
  });
}

export function uploadFiles(prefix, files, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/upload?prefix=${encodeURIComponent(prefix)}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    const uploadError = () => {
      const err = new Error('UPLOAD_FAILED');
      err.code = 'UPLOAD_FAILED';
      return err;
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({});
        }
      } else {
        reject(uploadError());
      }
    };
    xhr.onerror = () => reject(uploadError());
    xhr.send(formData);
  });
}

export function getShare(key) {
  return request(`/share?key=${encodeURIComponent(key)}`);
}

export function createShare(key, expiresAt, previewEnabled) {
  return request('/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, expiresAt: expiresAt || null, previewEnabled: Boolean(previewEnabled) }),
  });
}

export function revokeShare(token) {
  return request(`/share/${token}`, { method: 'DELETE' });
}

export function emailShare(token, recipients) {
  return request(`/share/${token}/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients }),
  });
}

export function getShareEmailInvites(key) {
  return request(`/share/invites?key=${encodeURIComponent(key)}`);
}

export function getActivity(limit, offset) {
  return request(`/activity?limit=${limit}&offset=${offset}`);
}

export function getFileStats(key) {
  return request(`/activity/file-stats?key=${encodeURIComponent(key)}`);
}

export function getFileStatsList() {
  return request('/activity/files');
}

export function getSettings() {
  return request('/settings');
}

export function updateSettings(partial) {
  return request('/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
}

export function updateOauthSettings(partial) {
  return request('/settings/oauth', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
}

export function testOauthSettings(partial) {
  return request('/settings/oauth/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
}

export const OAUTH_LOGIN_URL = `${BASE}/oauth/login`;

export function updateSmtpSettings(partial) {
  return request('/settings/smtp', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
}

export function getVersion() {
  return request('/version');
}

export function testSmtpSettings(partial) {
  return request('/settings/smtp/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
}
