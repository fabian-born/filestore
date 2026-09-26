import { findById } from './users.js';

// Every login gets a brand new session ID (regenerate) rather than reusing
// whatever cookie the browser arrived with - otherwise an ID planted before
// login (session fixation) would become authenticated along with it.
export function establishSession(req, userId, authMethod) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      const user = findById(userId);
      req.session.authenticated = true;
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.isAdmin = Boolean(user.is_admin);
      req.session.authMethod = authMethod;
      req.session.passwordChangedAt = user.password_changed_at ?? null;
      resolve(user);
    });
  });
}

// Runs on every request: the session only caches who the user is, the
// database stays the source of truth. A deleted account, or a password
// changed since this session logged in, ends the session right away (swapped
// for a fresh anonymous one) instead of whenever the cookie expires, and an
// admin flag change takes effect on the next request.
export function syncSessionUser(req, res, next) {
  if (!req.session?.authenticated) return next();
  const user = findById(req.session.userId);
  if (!user || (user.password_changed_at ?? null) !== (req.session.passwordChangedAt ?? null)) {
    return req.session.regenerate(next);
  }
  req.session.username = user.username;
  req.session.isAdmin = Boolean(user.is_admin);
  next();
}

export function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'NOT_AUTHENTICATED' });
}

export function requireAdmin(req, res, next) {
  if (req.session?.authenticated && req.session?.isAdmin) return next();
  res.status(req.session?.authenticated ? 403 : 401).json({ error: req.session?.authenticated ? 'FORBIDDEN' : 'NOT_AUTHENTICATED' });
}

// OAuth provider settings are only changeable from a session authenticated
// with the local username/password login - never from an OAuth-authenticated
// session, even an admin one. Otherwise a compromised or misconfigured OAuth
// account could repoint the provider settings at an attacker-controlled IdP.
export function requireLocalAdmin(req, res, next) {
  if (!req.session?.authenticated) return res.status(401).json({ error: 'NOT_AUTHENTICATED' });
  if (!req.session?.isAdmin) return res.status(403).json({ error: 'FORBIDDEN' });
  if (req.session?.authMethod !== 'local') return res.status(403).json({ error: 'LOCAL_ADMIN_REQUIRED' });
  next();
}
