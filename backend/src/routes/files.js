import { Router } from 'express';
import Busboy from 'busboy';
import { Transform } from 'node:stream';
import { getMinioClient } from '../minioClient.js';
import db from '../db.js';
import { getSettings } from '../settings.js';
import { normalizePrefix, sanitizeSegment, basename, parsePaging, parseSort, sortListing } from '../utils.js';
import { listAllKeys, statExists } from '../objectOps.js';
import { logActivity } from '../activity.js';
import { setFileOwner, renameFileOwner, deleteFileOwners, getFileOwners } from '../fileOwners.js';
import { effectiveQuotaBytes, getUsage, addUsage } from '../quota.js';
import { findById } from '../users.js';
import {
  isAdmin,
  isWithinAllowed,
  isProtectedRoot,
  isOrphanedUserFolder,
  homePrefix,
  SHARED_PREFIX,
} from '../permissions.js';

const router = Router();

// Marks each file with whether it currently has an active (non-expired)
// share, in one batched query rather than one per file.
function markShared(files) {
  if (!files.length) return;
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT DISTINCT object_key FROM shares WHERE object_key IN (${files.map(() => '?').join(',')}) AND (expires_at IS NULL OR expires_at > ?)`
    )
    .all(...files.map((f) => f.key), now);
  const sharedKeys = new Set(rows.map((r) => r.object_key));
  files.forEach((f) => {
    f.shared = sharedKeys.has(f.key);
  });
}

// Attaches the recorded uploader (if any) to each listed file, in one
// batched lookup rather than one per file.
function markOwner(files) {
  if (!files.length) return;
  const owners = getFileOwners(files.map((f) => f.key));
  files.forEach((f) => {
    const owner = owners.get(f.key);
    if (owner) f.owner = owner.ownerUsername;
  });
}

// Frees up whatever quota usage the deleted keys were counted against,
// grouped by owner since a folder can contain files from more than one
// owner. Must run before deleteFileOwners() - it needs those rows' sizes.
function freeUsageForKeys(keys) {
  const owners = getFileOwners(keys);
  const byOwner = new Map();
  for (const { ownerId, size } of owners.values()) {
    if (!ownerId) continue;
    byOwner.set(ownerId, (byOwner.get(ownerId) || 0) + (size || 0));
  }
  byOwner.forEach((total, ownerId) => addUsage(ownerId, -total));
}

// Flags a listed user home folder whose account has since been deleted, so
// the UI can explain why an otherwise-ordinary-looking folder is safe to
// clean up (see isOrphanedUserFolder).
function markOrphaned(folders) {
  folders.forEach((f) => {
    if (isOrphanedUserFolder(f.key)) f.orphaned = true;
  });
}

// Folders are always listed before files (as the UI shows them) and the
// requested page is sliced across that combined order, so a page boundary
// can fall in the middle of either group exactly like a single flat list.
function paginate(folders, files, limit, offset) {
  const combined = [
    ...folders.map((f) => ({ ...f, __folder: true })),
    ...files.map((f) => ({ ...f, __folder: false })),
  ];
  const total = combined.length;
  const page = limit === null ? combined.slice(offset) : combined.slice(offset, offset + limit);
  const pageFolders = [];
  const pageFiles = [];
  page.forEach(({ __folder, ...item }) => (__folder ? pageFolders : pageFiles).push(item));
  return { folders: pageFolders, files: pageFiles, total };
}

router.get('/browse', async (req, res) => {
  try {
    const prefix = normalizePrefix(req.query.prefix || '');

    if (!isAdmin(req)) {
      if (!prefix) {
        const rootFolders = [
          { name: 'shared', key: SHARED_PREFIX },
          { name: req.session.username, key: homePrefix(req.session.username) },
        ];
        return res.json({ prefix: '', folders: rootFolders, files: [], total: rootFolders.length });
      }
      if (!isWithinAllowed(req, prefix)) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const stream = getMinioClient().listObjectsV2(getSettings().bucket, prefix, false);
    const folders = [];
    const files = [];

    await new Promise((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj.prefix) {
          folders.push({ name: basename(obj.prefix), key: obj.prefix });
        } else if (obj.name && obj.name !== prefix) {
          const name = obj.name.slice(prefix.length);
          if (name === '.keep') return;
          files.push({ name, key: obj.name, size: obj.size, lastModified: obj.lastModified });
        }
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const { sortBy, sortDir } = parseSort(req.query);
    const sortedFolders = sortListing(folders, 'name', sortBy === 'name' ? sortDir : 'asc');
    const sortedFiles = sortListing(files, sortBy, sortDir);

    const { limit, offset } = parsePaging(req.query);
    const page = paginate(sortedFolders, sortedFiles, limit, offset);
    markShared(page.files);
    markOwner(page.files);
    if (isAdmin(req)) markOrphaned(page.folders);

    res.json({ prefix, ...page });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'BROWSE_FAILED' });
  }
});

router.get('/search', async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) return res.json({ folders: [], files: [], total: 0 });
    const lower = query.toLowerCase();
    const bucket = getSettings().bucket;
    const stream = getMinioClient().listObjectsV2(bucket, '', true);
    const folders = [];
    const files = [];

    await new Promise((resolve, reject) => {
      stream.on('data', (obj) => {
        if (!obj.name) return;
        if (obj.name.endsWith('/.keep')) {
          const folderKey = obj.name.slice(0, -'.keep'.length);
          if (!isAdmin(req) && !isWithinAllowed(req, folderKey)) return;
          const folderName = basename(folderKey);
          if (folderName.toLowerCase().includes(lower)) {
            folders.push({ name: folderName, key: folderKey });
          }
          return;
        }
        if (!isAdmin(req) && !isWithinAllowed(req, obj.name)) return;
        const name = basename(obj.name);
        if (name.toLowerCase().includes(lower)) {
          files.push({ name, key: obj.name, size: obj.size, lastModified: obj.lastModified });
        }
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const { sortBy, sortDir } = parseSort(req.query);
    const sortedFolders = sortListing(folders, 'name', sortBy === 'name' ? sortDir : 'asc');
    const sortedFiles = sortListing(files, sortBy, sortDir);

    const { limit, offset } = parsePaging(req.query);
    const page = paginate(sortedFolders, sortedFiles, limit, offset);
    markShared(page.files);
    markOwner(page.files);
    if (isAdmin(req)) markOrphaned(page.folders);

    res.json(page);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SEARCH_FAILED' });
  }
});

router.post('/folders', async (req, res) => {
  try {
    const prefix = normalizePrefix(req.body.prefix || '');
    if (!isAdmin(req) && !isWithinAllowed(req, prefix)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const name = sanitizeSegment(req.body.name);
    if (!name) return res.status(400).json({ error: 'INVALID_FOLDER_NAME' });

    const key = `${prefix}${name}/.keep`;
    await getMinioClient().putObject(getSettings().bucket, key, Buffer.alloc(0));
    res.status(201).json({ key: `${prefix}${name}/` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'CREATE_FOLDER_FAILED' });
  }
});

// Finds the first "name (n).ext" that's free, both against what's already in
// the bucket and against names already claimed earlier in this same upload -
// two files in one batch can share a name before either has been written yet.
async function resolveUniqueName(client, bucket, prefix, name, claimed) {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  let n = 1;
  while (claimed.has(candidate) || (await statExists(client, bucket, `${prefix}${candidate}`))) {
    candidate = `${base} (${n})${ext}`;
    n += 1;
  }
  claimed.add(candidate);
  return candidate;
}

// Streams straight into putObject while counting bytes as they pass through,
// so a quota can be enforced *during* the upload (aborting once the running
// total would exceed it) rather than only after the fact - a single huge
// file can't blow far past the limit before anyone notices. quotaCheck is
// null when the uploader has no quota (admins, or quota disabled).
function putObjectWithQuota(minioClient, bucket, key, fileStream, contentType, quotaCheck) {
  return new Promise((resolve, reject) => {
    let bytesRead = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      fileStream.destroy();
      reject(err);
    };

    const limiter = new Transform({
      transform(chunk, enc, callback) {
        bytesRead += chunk.length;
        if (quotaCheck && !quotaCheck(bytesRead)) {
          const err = new Error('QUOTA_EXCEEDED');
          err.code = 'QUOTA_EXCEEDED';
          callback(err);
          return;
        }
        callback(null, chunk);
      },
    });

    fileStream.on('error', fail);
    limiter.on('error', fail);
    const limited = fileStream.pipe(limiter);

    minioClient
      .putObject(bucket, key, limited, undefined, { 'Content-Type': contentType })
      .then(() => {
        if (settled) return;
        settled = true;
        resolve(bytesRead);
      })
      .catch(fail);
  });
}

router.post('/upload', (req, res) => {
  const prefix = normalizePrefix(req.query.prefix || '');
  if (!isAdmin(req) && !isWithinAllowed(req, prefix)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const bucket = getSettings().bucket;
  const minioClient = getMinioClient();
  const bb = Busboy({ headers: req.headers });
  const claimed = new Set();
  const renamed = [];

  const user = findById(req.session.userId);
  const quotaBytes = effectiveQuotaBytes(user, getSettings());
  let usedSoFar = getUsage(req.session.userId);
  let quotaExceeded = false;
  let uploadedCount = 0;

  // Files are written one at a time (chained, not Promise.all) so that name
  // resolution above can't race between two files sharing an original name.
  let chain = Promise.resolve();
  let responded = false;

  bb.on('file', (fieldname, fileStream, info) => {
    const safeName = sanitizeSegment(info.filename);
    if (!safeName) {
      fileStream.resume();
      return;
    }
    chain = chain.then(async () => {
      if (quotaExceeded) {
        fileStream.resume();
        return;
      }
      if (quotaBytes !== null && usedSoFar >= quotaBytes) {
        quotaExceeded = true;
        fileStream.resume();
        return;
      }

      const finalName = await resolveUniqueName(minioClient, bucket, prefix, safeName, claimed);
      if (finalName !== safeName) renamed.push({ original: safeName, saved: finalName });
      const key = `${prefix}${finalName}`;

      let size;
      try {
        size = await putObjectWithQuota(
          minioClient,
          bucket,
          key,
          fileStream,
          info.mimeType,
          quotaBytes === null ? null : (bytesSoFar) => usedSoFar + bytesSoFar <= quotaBytes
        );
      } catch (err) {
        if (err.code === 'QUOTA_EXCEEDED') {
          quotaExceeded = true;
          return;
        }
        throw err;
      }

      usedSoFar += size;
      uploadedCount += 1;
      setFileOwner(key, req.session.userId, req.session.username, size, info.mimeType);
      addUsage(req.session.userId, size);
      logActivity({ userId: req.session.userId, username: req.session.username, action: 'upload', objectKey: key });
    });
  });

  bb.on('error', (err) => {
    if (!responded) {
      responded = true;
      console.error(err);
      res.status(500).json({ error: 'UPLOAD_FAILED' });
    }
  });

  bb.on('finish', async () => {
    try {
      await chain;
      if (!responded) {
        responded = true;
        if (quotaExceeded && uploadedCount === 0) {
          res.status(413).json({ error: 'QUOTA_EXCEEDED' });
        } else {
          res.status(201).json({ ok: true, renamed, quotaExceeded });
        }
      }
    } catch (err) {
      if (!responded) {
        responded = true;
        console.error(err);
        res.status(500).json({ error: 'UPLOAD_FAILED' });
      }
    }
  });

  req.pipe(bb);
});

router.get('/folders/count', async (req, res) => {
  try {
    const prefix = normalizePrefix(req.query.prefix || '');
    if (!prefix) return res.status(400).json({ error: 'MISSING_PREFIX' });
    if (!isAdmin(req) && !isWithinAllowed(req, prefix)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const stream = getMinioClient().listObjectsV2(getSettings().bucket, prefix, true);
    let count = 0;
    await new Promise((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj.name && !obj.name.endsWith('/.keep')) count++;
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'COUNT_FAILED' });
  }
});

router.delete('/objects', async (req, res) => {
  try {
    const { key, isFolder } = req.body;
    if (!key) return res.status(400).json({ error: 'MISSING_KEY' });

    const checkKey = isFolder ? normalizePrefix(key) : key;
    if (!isAdmin(req) && !isWithinAllowed(req, checkKey)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (isFolder && isProtectedRoot(checkKey) && !isOrphanedUserFolder(checkKey)) {
      return res.status(400).json({ error: 'CANNOT_DELETE_ROOT_FOLDER' });
    }

    const bucket = getSettings().bucket;
    const minioClient = getMinioClient();

    if (isFolder) {
      const prefix = normalizePrefix(key);
      const keys = await listAllKeys(minioClient, bucket, prefix);
      if (keys.length) {
        await minioClient.removeObjects(bucket, keys);
        db.prepare(
          `DELETE FROM shares WHERE object_key IN (${keys.map(() => '?').join(',')})`
        ).run(...keys);
        freeUsageForKeys(keys);
        deleteFileOwners(keys);
      }
    } else {
      await minioClient.removeObject(bucket, key);
      db.prepare('DELETE FROM shares WHERE object_key = ?').run(key);
      freeUsageForKeys([key]);
      deleteFileOwners([key]);
    }

    logActivity({
      userId: req.session.userId,
      username: req.session.username,
      action: 'delete',
      objectKey: checkKey,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DELETE_FAILED' });
  }
});

// Renaming is a move within the same parent folder - unlike /admin/move
// (arbitrary destination, admin-only), this is available to any user for
// items within their own allowed roots.
router.post('/rename', async (req, res) => {
  try {
    const { key, isFolder, newName } = req.body || {};
    if (!key) return res.status(400).json({ error: 'MISSING_KEY' });

    const name = sanitizeSegment(newName);
    if (!name) return res.status(400).json({ error: 'INVALID_NAME' });

    const checkKey = isFolder ? normalizePrefix(key) : key;
    if (!isAdmin(req) && !isWithinAllowed(req, checkKey)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const bucket = getSettings().bucket;
    const client = getMinioClient();

    if (isFolder) {
      const sourcePrefix = normalizePrefix(key);
      if (isProtectedRoot(sourcePrefix) && !isOrphanedUserFolder(sourcePrefix)) {
        return res.status(400).json({ error: 'CANNOT_RENAME_ROOT_FOLDER' });
      }

      const oldName = basename(sourcePrefix);
      const parent = sourcePrefix.slice(0, sourcePrefix.length - oldName.length - 1);
      const newPrefix = `${parent}${name}/`;
      if (newPrefix === sourcePrefix) return res.status(400).json({ error: 'SAME_NAME' });

      const destKeys = await listAllKeys(client, bucket, newPrefix);
      if (destKeys.length > 0) return res.status(409).json({ error: 'DESTINATION_EXISTS' });

      const sourceKeys = await listAllKeys(client, bucket, sourcePrefix);
      for (const from of sourceKeys) {
        const to = newPrefix + from.slice(sourcePrefix.length);
        await client.copyObject(bucket, to, `/${bucket}/${from}`);
        await client.removeObject(bucket, from);
        db.prepare('UPDATE shares SET object_key = ? WHERE object_key = ?').run(to, from);
        renameFileOwner(from, to);
      }

      logActivity({
        userId: req.session.userId,
        username: req.session.username,
        action: 'rename',
        objectKey: sourcePrefix,
        detail: newPrefix,
      });
      return res.json({ key: newPrefix });
    }

    const oldName = basename(key);
    const parent = key.slice(0, key.length - oldName.length);
    const newKey = `${parent}${name}`;
    if (newKey === key) return res.status(400).json({ error: 'SAME_NAME' });
    if (await statExists(client, bucket, newKey)) {
      return res.status(409).json({ error: 'DESTINATION_EXISTS' });
    }

    await client.copyObject(bucket, newKey, `/${bucket}/${key}`);
    await client.removeObject(bucket, key);
    db.prepare('UPDATE shares SET object_key = ? WHERE object_key = ?').run(newKey, key);
    renameFileOwner(key, newKey);

    logActivity({
      userId: req.session.userId,
      username: req.session.username,
      action: 'rename',
      objectKey: key,
      detail: newKey,
    });
    res.json({ key: newKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'RENAME_FAILED' });
  }
});

// Lets the current user see their own storage usage (e.g. for a progress
// bar) without exposing anyone else's - admins have no quota, so this
// always reports unlimited for them.
router.get('/quota/me', (req, res) => {
  const user = findById(req.session.userId);
  const quotaBytes = effectiveQuotaBytes(user, getSettings());
  res.json({ usedBytes: getUsage(req.session.userId), quotaBytes });
});

export default router;
