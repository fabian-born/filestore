import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { getMinioClient } from '../minioClient.js';
import { getSettings } from '../settings.js';
import db from '../db.js';
import { normalizePrefix, basename } from '../utils.js';
import { isProtectedRoot } from '../permissions.js';
import { createJob, getJob, scheduleCleanup } from '../moveJobs.js';
import { listAllKeys, statExists } from '../objectOps.js';
import { renameFileOwner } from '../fileOwners.js';

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

export default router;
