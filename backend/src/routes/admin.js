import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { getMinioClient } from '../minioClient.js';
import { getSettings } from '../settings.js';
import db from '../db.js';
import { normalizePrefix, basename } from '../utils.js';
import { isProtectedRoot } from '../permissions.js';
import { createJob, getJob, scheduleCleanup } from '../moveJobs.js';
import { listAllKeys, listAllKeysWithSize, statExists } from '../objectOps.js';
import { renameFileOwner, setFileOwner, getFileOwners } from '../fileOwners.js';
import { findById } from '../users.js';
import { addUsage } from '../quota.js';
import { logActivity } from '../activity.js';

const router = Router();

async function runMove(client, bucket, job, pairs) {
  try {
    for (const { from, to } of pairs) {
      await client.copyObject(bucket, to, `/${bucket}/${from}`);
      await client.removeObject(bucket, from);
      db.prepare('UPDATE shares SET object_key = ? WHERE object_key = ?').run(to, from);
      renameFileOwner(from, to);
      job.moved += 1;
    }
    job.status = 'done';
  } catch (err) {
    console.error(err);
    job.status = 'error';
    job.error = 'MOVE_FAILED';
  } finally {
    scheduleCleanup(job.id);
  }
}

router.post('/admin/move', requireAdmin, async (req, res) => {
  const { items, destPrefix } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'MISSING_KEY' });
  }

  const bucket = getSettings().bucket;
  const client = getMinioClient();
  const dest = normalizePrefix(destPrefix || '');

  try {
    const allPairs = [];

    for (const item of items) {
      const sourceKey = item?.key;
      if (!sourceKey) return res.status(400).json({ error: 'MISSING_KEY' });

      if (item.isFolder) {
        const sourcePrefix = normalizePrefix(sourceKey);
        if (isProtectedRoot(sourcePrefix)) {
          return res.status(400).json({ error: 'CANNOT_MOVE_ROOT_FOLDER' });
        }
        const name = basename(sourcePrefix);
        const newPrefix = `${dest}${name}/`;
        if (dest === sourcePrefix || dest.startsWith(sourcePrefix) || newPrefix === sourcePrefix) {
          return res.status(400).json({ error: 'INVALID_DESTINATION' });
        }

        const sourceKeys = await listAllKeys(client, bucket, sourcePrefix);
        for (const key of sourceKeys) {
          allPairs.push({ from: key, to: newPrefix + key.slice(sourcePrefix.length) });
        }
      } else {
        const name = basename(sourceKey);
        const newKey = `${dest}${name}`;
        if (newKey === sourceKey) {
          return res.status(400).json({ error: 'INVALID_DESTINATION' });
        }
        allPairs.push({ from: sourceKey, to: newKey });
      }
    }

    // Two selected items landing on the same destination key would silently
    // clobber one another mid-job, so that's rejected same as a real conflict.
    const destKeys = new Set();
    for (const { to } of allPairs) {
      if (destKeys.has(to)) return res.status(409).json({ error: 'DESTINATION_EXISTS' });
      destKeys.add(to);
    }

    for (const { to } of allPairs) {
      if (await statExists(client, bucket, to)) {
        return res.status(409).json({ error: 'DESTINATION_EXISTS' });
      }
    }

    const job = createJob(allPairs.length);
    res.status(202).json({ jobId: job.id });
    runMove(client, bucket, job, allPairs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'MOVE_FAILED' });
  }
});

router.get('/admin/move/:jobId', requireAdmin, (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
  res.json({ status: job.status, total: job.total, moved: job.moved, error: job.error });
});

// Reassigns the owner of a single file, or - recursively - of every file
// under a folder. Quota usage moves with it: the previous owner (if any) is
// credited back, the new owner is charged, based on each object's *actual*
// current size (not whatever might be stale in file_owners).
router.put('/admin/owner', requireAdmin, async (req, res) => {
  const { key, isFolder, ownerId } = req.body || {};
  if (!key) return res.status(400).json({ error: 'MISSING_KEY' });
  if (!ownerId) return res.status(400).json({ error: 'MISSING_OWNER' });

  const newOwner = findById(Number(ownerId));
  if (!newOwner) return res.status(404).json({ error: 'OWNER_NOT_FOUND' });

  const bucket = getSettings().bucket;
  const client = getMinioClient();

  try {
    if (isFolder) {
      const prefix = normalizePrefix(key);
      const entries = (await listAllKeysWithSize(client, bucket, prefix)).filter(
        (e) => !e.key.endsWith('/.keep')
      );

      if (entries.length) {
        const existing = getFileOwners(entries.map((e) => e.key));
        const deltas = new Map();
        for (const { key: entryKey, size } of entries) {
          const prevOwnerId = existing.get(entryKey)?.ownerId;
          if (prevOwnerId) deltas.set(prevOwnerId, (deltas.get(prevOwnerId) || 0) - size);
          deltas.set(newOwner.id, (deltas.get(newOwner.id) || 0) + size);
          setFileOwner(entryKey, newOwner.id, newOwner.username, size);
        }
        deltas.forEach((delta, id) => addUsage(id, delta));
      }

      logActivity({
        userId: req.session.userId,
        username: req.session.username,
        action: 'owner_change',
        objectKey: prefix,
        detail: newOwner.username,
      });
      return res.json({ ok: true, count: entries.length });
    }

    const stat = await client.statObject(bucket, key).catch(() => null);
    if (!stat) return res.status(404).json({ error: 'FILE_NOT_FOUND' });

    const prevOwnerId = getFileOwners([key]).get(key)?.ownerId;
    if (prevOwnerId) addUsage(prevOwnerId, -stat.size);
    setFileOwner(key, newOwner.id, newOwner.username, stat.size);
    addUsage(newOwner.id, stat.size);

    logActivity({
      userId: req.session.userId,
      username: req.session.username,
      action: 'owner_change',
      objectKey: key,
      detail: newOwner.username,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'OWNER_CHANGE_FAILED' });
  }
});

export default router;
