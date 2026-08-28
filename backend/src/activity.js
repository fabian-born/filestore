import db from './db.js';

// 'view'/'download' are anonymous share-link hits, not something any
// particular account did - they're excluded from the personal/admin activity
// timeline and only ever surfaced in aggregate via fileStats().
const TIMELINE_ACTIONS = "action NOT IN ('view', 'download')";

const insert = db.prepare(
  `INSERT INTO activity (user_id, username, action, object_key, detail, created_at, user_agent, bytes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

function toDto(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    action: row.action,
    objectKey: row.object_key,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

export function logActivity({
  userId = null,
  username = null,
  action,
  objectKey = null,
  detail = null,
  userAgent = null,
  bytes = null,
}) {
  insert.run(userId, username, action, objectKey, detail, new Date().toISOString(), userAgent, bytes);
}

// userId omitted/undefined -> every user's activity (admin view).
// limit === null -> no LIMIT/OFFSET clause at all (the "all" page size).
export function listActivity({ userId, limit, offset }) {
  const params = [];
  let sql = `SELECT * FROM activity WHERE ${TIMELINE_ACTIONS}`;
  if (userId) {
    sql = `SELECT * FROM activity WHERE user_id = ? AND ${TIMELINE_ACTIONS}`;
    params.push(userId);
  }
  sql += ' ORDER BY id DESC';
  if (limit !== null) {
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }
  const rows = db.prepare(sql).all(...params);
  return rows.map(toDto);
}

export function countActivity({ userId }) {
  const row = userId
    ? db.prepare(`SELECT COUNT(*) AS c FROM activity WHERE user_id = ? AND ${TIMELINE_ACTIONS}`).get(userId)
    : db.prepare(`SELECT COUNT(*) AS c FROM activity WHERE ${TIMELINE_ACTIONS}`).get();
  return row.c;
}

export function fileStats(objectKey) {
  const views = db.prepare("SELECT COUNT(*) AS c FROM activity WHERE object_key = ? AND action = 'view'").get(objectKey).c;
  const downloads = db
    .prepare("SELECT COUNT(*) AS c FROM activity WHERE object_key = ? AND action = 'download'")
    .get(objectKey).c;
  return { views, downloads };
}

// Who a share link has been emailed to for a given file, most recent first -
// across every share token that file has ever had, since the question is
// "who did I invite to this file", not "who got this specific link".
export function listShareEmailInvites(objectKey) {
  const rows = db
    .prepare(
      `SELECT detail AS recipient, action, username, created_at AS createdAt
       FROM activity
       WHERE object_key = ? AND action IN ('share_email', 'share_email_failed')
       ORDER BY id DESC`
    )
    .all(objectKey);
  return rows.map((r) => ({
    recipient: r.recipient,
    username: r.username,
    success: r.action === 'share_email',
    createdAt: r.createdAt,
  }));
}

const ADMIN_AUDIT_ACTIONS = [
  'settings_change',
  'user_created',
  'user_deleted',
  'quota_change',
  'password_reset',
];

// How many login attempts got rate-limited in the last 24h - a quick
// brute-force-activity indicator for the security stats panel.
export function countBlockedLogins24h() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return db
    .prepare("SELECT COUNT(*) AS c FROM activity WHERE action = 'login_blocked' AND created_at > ?")
    .get(since).c;
}

// Recent admin-configuration changes (settings, user management) - the
// audit-trail gap that plain file activity doesn't cover.
export function listAdminAudit(limit = 20) {
  const placeholders = ADMIN_AUDIT_ACTIONS.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT * FROM activity WHERE action IN (${placeholders}) ORDER BY id DESC LIMIT ?`
    )
    .all(...ADMIN_AUDIT_ACTIONS, limit);
  return rows.map(toDto);
}

// How many attempts hit an already-expired share link, most recent first -
// distinct from a normal 'download'/'view', which only ever fire for links
// that were still valid at the time.
export function countExpiredShareAccess24h() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return db
    .prepare("SELECT COUNT(*) AS c FROM activity WHERE action = 'share_expired_access' AND created_at > ?")
    .get(since).c;
}

// Daily login counts for the last `days` days, split by auth method - shows
// local vs. OAuth adoption over time.
export function loginTrendByDay(days = 14) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT
         substr(created_at, 1, 10) AS date,
         SUM(CASE WHEN detail = 'local' THEN 1 ELSE 0 END) AS local,
         SUM(CASE WHEN detail = 'oauth' THEN 1 ELSE 0 END) AS oauth
       FROM activity
       WHERE action = 'login' AND created_at > ?
       GROUP BY date
       ORDER BY date ASC`
    )
    .all(since);
  return rows;
}

// Rough desktop/mobile/unknown split based on the user-agent captured at
// login - "Mobi" is the token virtually every mobile browser UA includes.
export function loginDeviceSplit() {
  return db
    .prepare(
      `SELECT
         SUM(CASE WHEN user_agent LIKE '%Mobi%' THEN 1 ELSE 0 END) AS mobile,
         SUM(CASE WHEN user_agent IS NOT NULL AND user_agent NOT LIKE '%Mobi%' THEN 1 ELSE 0 END) AS desktop,
         SUM(CASE WHEN user_agent IS NULL THEN 1 ELSE 0 END) AS unknown
       FROM activity
       WHERE action = 'login'`
    )
    .get();
}

// Total bytes actually transferred out via share-link downloads - the
// externally-relevant "bandwidth" number, as opposed to bytes stored.
export function shareBandwidthTotal() {
  const row = db.prepare("SELECT SUM(bytes) AS total FROM activity WHERE action = 'download' AND bytes IS NOT NULL").get();
  return row.total || 0;
}

// One row per file that's ever been viewed/downloaded via a share link, most
// active first. Includes files since deleted - this is a historical record,
// not a live listing, and reflects that the same way the timeline does.
export function listFileStats() {
  const rows = db
    .prepare(
      `SELECT
         object_key AS objectKey,
         SUM(CASE WHEN action = 'view' THEN 1 ELSE 0 END) AS views,
         SUM(CASE WHEN action = 'download' THEN 1 ELSE 0 END) AS downloads,
         MAX(created_at) AS lastAt
       FROM activity
       WHERE action IN ('view', 'download')
       GROUP BY object_key
       ORDER BY (views + downloads) DESC, lastAt DESC`
    )
    .all();
  return rows;
}
