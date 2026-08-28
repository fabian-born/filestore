import { findByUsername } from './users.js';

export const SHARED_PREFIX = 'shared/';
export const USERS_ROOT = 'users/';

export function homePrefix(username) {
  return `${USERS_ROOT}${username}/`;
}

export function isAdmin(req) {
  return Boolean(req.session?.isAdmin);
}

export function allowedRoots(req) {
  return [homePrefix(req.session.username), SHARED_PREFIX];
}

// Admins are unrestricted; everyone else may only touch keys/prefixes under
// their own home folder or the shared folder.
export function isWithinAllowed(req, key) {
  if (isAdmin(req)) return true;
  return allowedRoots(req).some((root) => key.startsWith(root));
}

// The shared folder and every user's home folder are structural - deleting
// them would silently break that user's access, so nobody (including admins)
// deletes them via the file browser.
export function isProtectedRoot(prefix) {
  if (prefix === SHARED_PREFIX) return true;
  return /^users\/[^/]+\/$/.test(prefix);
}

// A user's home folder name if `prefix` is exactly one (e.g. 'users/alice/'),
// otherwise null.
export function homeFolderUsername(prefix) {
  const match = /^users\/([^/]+)\/$/.exec(prefix);
  return match ? match[1] : null;
}

// True once the account behind a home folder has been deleted - the folder
// is then just leftover data, not a live user's access point, so the
// isProtectedRoot safety net no longer applies to it.
export function isOrphanedUserFolder(prefix) {
  const username = homeFolderUsername(prefix);
  return Boolean(username) && !findByUsername(username);
}
