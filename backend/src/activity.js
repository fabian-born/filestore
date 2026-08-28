import db from './db.js';

// 'view'/'download' are anonymous share-link hits, not something any
// particular account did - they're excluded from the personal/admin activity
// timeline and only ever surfaced in aggregate via fileStats().
const TIMELINE_ACTIONS = "action NOT IN ('view', 'download')";

const insert = db.prepare(
  'INSERT INTO activity (user_id, username, action, object_key, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
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

export function logActivity({ userId = null, username = null, action, objectKey = null, detail = null }) {
  insert.run(userId, username, action, objectKey, detail, new Date().toISOString());
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
