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
