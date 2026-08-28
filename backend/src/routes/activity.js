import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { isAdmin, isWithinAllowed } from '../permissions.js';
import { parsePaging } from '../utils.js';
import { listActivity, countActivity, fileStats, listFileStats } from '../activity.js';

const router = Router();

router.get('/activity', requireAuth, (req, res) => {
  const { limit, offset } = parsePaging(req.query);
  // Non-admins are hard-scoped to their own user id server-side - the client
  // has no way to ask for anyone else's activity.
  const scopeUserId = isAdmin(req) ? undefined : req.session.userId;

  res.json({
    entries: listActivity({ userId: scopeUserId, limit, offset }),
    total: countActivity({ userId: scopeUserId }),
  });
});

router.get('/activity/file-stats', requireAuth, (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'MISSING_KEY' });
  if (!isAdmin(req) && !isWithinAllowed(req, key)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  res.json(fileStats(key));
});

// Every file that's ever had a view/download, most active first. Non-admins
// are scoped to their own allowed roots (their home folder + shared) just
// like everywhere else - they never see other users' file activity here.
router.get('/activity/files', requireAuth, (req, res) => {
  const admin = isAdmin(req);
  const files = listFileStats().filter((row) => admin || isWithinAllowed(req, row.objectKey));
  res.json({ files });
});

export default router;
