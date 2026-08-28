import db from './db.js';

const upsert = db.prepare(
  `INSERT INTO file_owners (object_key, owner_id, owner_username, created_at) VALUES (?, ?, ?, ?)
   ON CONFLICT(object_key) DO UPDATE SET owner_id = excluded.owner_id, owner_username = excluded.owner_username`
);

// Recorded at upload time; the uploader is the owner. Re-uploading over an
// existing key (a dedup-renamed upload never collides, but a folder that's
// re-created certainly can) re-stamps it with whoever uploaded it now.
export function setFileOwner(objectKey, ownerId, ownerUsername) {
  upsert.run(objectKey, ownerId, ownerUsername, new Date().toISOString());
}

// Used by rename and move (both are just copy+delete under the hood) so the
// owner follows the file to its new key instead of being silently dropped.
export function renameFileOwner(fromKey, toKey) {
  db.prepare('UPDATE file_owners SET object_key = ? WHERE object_key = ?').run(toKey, fromKey);
}

export function deleteFileOwners(objectKeys) {
  if (!objectKeys.length) return;
  db.prepare(`DELETE FROM file_owners WHERE object_key IN (${objectKeys.map(() => '?').join(',')})`).run(
    ...objectKeys
  );
}

// Batched lookup for a page of listed files, mirroring markShared()'s shape.
export function getFileOwners(objectKeys) {
  if (!objectKeys.length) return new Map();
  const rows = db
    .prepare(
      `SELECT object_key, owner_id, owner_username FROM file_owners WHERE object_key IN (${objectKeys.map(() => '?').join(',')})`
    )
    .all(...objectKeys);
  return new Map(rows.map((r) => [r.object_key, { ownerId: r.owner_id, ownerUsername: r.owner_username }]));
}
