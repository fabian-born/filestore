import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { listUsers, createUser, deleteUser, findById, countAdmins, updatePassword } from '../users.js';
import { sanitizeSegment } from '../utils.js';
import { getMinioClient } from '../minioClient.js';
import { getSettings } from '../settings.js';
import { homePrefix } from '../permissions.js';

const router = Router();

router.get('/users', requireAdmin, (req, res) => {
  res.json({ users: listUsers() });
});

router.post('/users', requireAdmin, async (req, res) => {
  const { username, password, isAdmin } = req.body || {};
  const name = sanitizeSegment(username);
  if (!name) return res.status(400).json({ error: 'INVALID_USERNAME' });
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'INVALID_PASSWORD' });
  }

  let user;
  try {
    user = createUser(name, password, Boolean(isAdmin));
  } catch (err) {
    if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'USERNAME_TAKEN' });
    }
    console.error(err);
    return res.status(500).json({ error: 'CREATE_USER_FAILED' });
  }

  try {
    await getMinioClient().putObject(getSettings().bucket, `${homePrefix(name)}.keep`, Buffer.alloc(0));
  } catch (err) {
    deleteUser(user.id);
    console.error(err);
    return res.status(500).json({ error: 'CREATE_USER_FAILED' });
  }

  res.status(201).json(user);
});

router.put('/users/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'INVALID_PASSWORD' });
  }

  const user = findById(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  updatePassword(user.id, password);
  res.json({ ok: true });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const user = findById(id);
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  if (id === req.session.userId) {
    return res.status(400).json({ error: 'CANNOT_DELETE_SELF' });
  }
  if (user.is_admin && countAdmins() <= 1) {
    return res.status(400).json({ error: 'LAST_ADMIN' });
  }

  deleteUser(id);
  res.json({ ok: true });
});

export default router;
