import { Router } from 'express';
import { verifyLogin, findById } from '../users.js';
import { logActivity } from '../activity.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = verifyLogin(username, password);

  if (!user) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  req.session.authenticated = true;
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.isAdmin = Boolean(user.is_admin);
  req.session.authMethod = 'local';
  logActivity({ userId: user.id, username: user.username, action: 'login', detail: 'local' });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  if (req.session?.authenticated) {
    logActivity({ userId: req.session.userId, username: req.session.username, action: 'logout' });
  }
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (req.session?.authenticated) {
    const user = findById(req.session.userId);
    return res.json({
      authenticated: true,
      id: req.session.userId,
      username: req.session.username,
      isAdmin: Boolean(req.session.isAdmin),
      authMethod: req.session.authMethod || 'local',
      firstName: user?.first_name || '',
      lastName: user?.last_name || '',
      email: user?.email || '',
    });
  }
  res.status(401).json({ authenticated: false });
});

export default router;
