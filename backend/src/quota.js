import db from './db.js';

const GB = 1024 ** 3;

export function gbToBytes(gb) {
  return Math.round(gb * GB);
}

const upsertUsage = db.prepare(
  `INSERT INTO user_storage (user_id, bytes_used) VALUES (?, ?)
   ON CONFLICT(user_id) DO UPDATE SET bytes_used = bytes_used + excluded.bytes_used`
);

// deltaBytes can be negative (freeing space on delete) - the running total
// is kept here rather than recomputed by listing the bucket, since that
// would mean a MinIO listing on every single upload.
export function addUsage(userId, deltaBytes) {
  if (!userId || !deltaBytes) return;
  upsertUsage.run(userId, deltaBytes);
}

export function getUsage(userId) {
  if (!userId) return 0;
  const row = db.prepare('SELECT bytes_used FROM user_storage WHERE user_id = ?').get(userId);
  return row ? row.bytes_used : 0;
}

export function totalUsageAcrossUsers() {
  const row = db.prepare('SELECT SUM(bytes_used) AS total FROM user_storage').get();
  return row.total || 0;
}

const upsertSnapshot = db.prepare(
  `INSERT INTO storage_snapshots (date, total_bytes) VALUES (?, ?)
   ON CONFLICT(date) DO UPDATE SET total_bytes = excluded.total_bytes`
);

// Called lazily whenever the capacity stats are viewed, rather than needing
// a cron job running inside the app - takes (or refreshes) today's snapshot
// so a growth trend gradually builds up across admin visits.
export function snapshotTodayStorage() {
  const today = new Date().toISOString().slice(0, 10);
  upsertSnapshot.run(today, totalUsageAcrossUsers());
}

export function storageGrowth(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return db
    .prepare('SELECT date, total_bytes AS totalBytes FROM storage_snapshots WHERE date >= ? ORDER BY date ASC')
    .all(since);
}

// Buckets every tracked file's size into a handful of broad categories by
// the top-level part of its stored content-type, rather than an exhaustive
// extension/mime mapping table.
export function fileTypeBreakdown() {
  const rows = db.prepare('SELECT content_type, size FROM file_owners').all();
  const categories = {};
  for (const { content_type, size } of rows) {
    const top = content_type ? content_type.split('/')[0] : null;
    const key = ['image', 'video', 'audio'].includes(top)
      ? top
      : top === 'application' || top === 'text'
        ? 'document'
        : top
          ? 'other'
          : 'unknown';
    categories[key] = categories[key] || { bytes: 0, count: 0 };
    categories[key].bytes += size || 0;
    categories[key].count += 1;
  }
  return Object.entries(categories)
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.bytes - a.bytes);
}

// null = unlimited. Admins are exempt - they manage the system, restricting
// their own uploads would just get in the way. A per-user override of 0
// (distinct from no override at all, which is NULL/undefined) means
// "unlimited for this one user".
export function effectiveQuotaBytes(user, settings) {
  if (!user || user.is_admin || user.isAdmin) return null;
  const overrideGb = user.quota_gb ?? user.quotaGb;
  if (overrideGb !== null && overrideGb !== undefined) {
    return overrideGb > 0 ? gbToBytes(overrideGb) : null;
  }
  const defaultGb = Number(settings.defaultQuotaGb) || 0;
  return defaultGb > 0 ? gbToBytes(defaultGb) : null;
}
