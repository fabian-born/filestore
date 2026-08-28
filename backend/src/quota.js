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
