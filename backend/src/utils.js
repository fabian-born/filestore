export function normalizePrefix(prefix) {
  if (!prefix) return '';
  let p = prefix.replace(/^\/+/, '').replace(/\.\.+/g, '');
  if (p && !p.endsWith('/')) p += '/';
  return p;
}

export function sanitizeSegment(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes('/') || trimmed === '.' || trimmed === '..') return null;
  return trimmed;
}

export function basename(key) {
  const parts = key.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

// Shared by /browse, /search and /activity: `limit=all` means "no limit",
// otherwise a positive integer clamped to maxLimit, defaulting to
// defaultLimit when missing/invalid.
export function parsePaging(query, { defaultLimit = 50, maxLimit = 500 } = {}) {
  const offset = Math.max(Number(query?.offset) || 0, 0);
  if (query?.limit === 'all') return { limit: null, offset };
  const limit = Math.min(Math.max(Number(query?.limit) || defaultLimit, 1), maxLimit);
  return { limit, offset };
}

const SORT_FIELDS = {
  name: (item) => (item.name || '').toLowerCase(),
  size: (item) => item.size ?? 0,
  modified: (item) => (item.lastModified ? new Date(item.lastModified).getTime() : 0),
};

// Shared by /browse and /search. Unknown/missing values fall back to
// name/asc rather than erroring - this only ever drives display order.
export function parseSort(query) {
  const sortBy = SORT_FIELDS[query?.sortBy] ? query.sortBy : 'name';
  const sortDir = query?.sortDir === 'desc' ? 'desc' : 'asc';
  return { sortBy, sortDir };
}

// Folders have no meaningful size/modified date, so they always sort by
// name - only when the requested sort *is* name does their order follow the
// requested direction too, matching how file managers usually behave.
export function sortListing(items, sortBy, sortDir) {
  const key = SORT_FIELDS[sortBy] || SORT_FIELDS.name;
  const dir = sortDir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const av = key(a);
    const bv = key(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}
