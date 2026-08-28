import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { findById, updatePassword, updateProfileDetails } from '../users.js';
import { verifyPassword } from '../password.js';
import { isValidEmail } from '../utils.js';

const router = Router();

router.put('/profile/password', requireAuth, (req, res) => {
  // An OAuth-authenticated session has no local password to prove knowledge
  // of (auto-provisioned accounts don't have a usable one at all), so this
  // is never available while signed in that way - regardless of whether the
  // account happens to also have a local password from before it was linked.
  if (req.session.authMethod === 'oauth') {
    return res.status(403).json({ error: 'OAUTH_PASSWORD_CHANGE_FORBIDDEN' });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'INVALID_PASSWORD' });
  }

  const user = findById(req.session.userId);
  if (!user || !verifyPassword(currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'INVALID_CURRENT_PASSWORD' });
  }

  updatePassword(user.id, newPassword);
  res.json({ ok: true });
});

// First/last name and email are IdP-managed for an OAuth account - synced
// automatically at login (see routes/oauth.js) - so editing them here is
// only available from a local session, same restriction as the password.
router.put('/profile/details', requireAuth, (req, res) => {
  if (req.session.authMethod === 'oauth') {
    return res.status(403).json({ error: 'OAUTH_PROFILE_READONLY' });
  }

  const { firstName, lastName, email } = req.body || {};
  if (firstName !== undefined && typeof firstName !== 'string') {
    return res.status(400).json({ error: 'INVALID_FIRST_NAME' });
  }
  if (lastName !== undefined && typeof lastName !== 'string') {
    return res.status(400).json({ error: 'INVALID_LAST_NAME' });
  }
  if (email !== undefined && email !== '' && !isValidEmail(email)) {
    return res.status(400).json({ error: 'INVALID_EMAIL' });
  }

  const user = updateProfileDetails(req.session.userId, {
    firstName: firstName !== undefined ? firstName.trim() : undefined,
    lastName: lastName !== undefined ? lastName.trim() : undefined,
    email: email !== undefined ? email.trim() : undefined,
  });
  res.json({ firstName: user.first_name || '', lastName: user.last_name || '', email: user.email || '' });
});

export default router;
