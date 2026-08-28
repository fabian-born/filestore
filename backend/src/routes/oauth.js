import { Router } from 'express';
import * as client from 'openid-client';
import { getOidcConfig, oauthSubjectFor } from '../oauth.js';
import { getSettings } from '../settings.js';
import { getMinioClient } from '../minioClient.js';
import { homePrefix } from '../permissions.js';
import { sanitizeSegment } from '../utils.js';
import {
  findByOauthSubject,
  findByEmail,
  linkOauthSubject,
  createOauthUser,
  uniqueUsernameFrom,
  updateProfileDetails,
} from '../users.js';
import { logActivity } from '../activity.js';

const router = Router();

// Mirrors buildShareUrl() in share.js: behind this app's nginx, req.protocol
// can't be trusted to reflect the real public scheme (no X-Forwarded-Proto is
// relayed), so the explicit shareDomain setting - the same "public base URL"
// used for share links - takes precedence when configured.
function redirectUri(req) {
  const domain = getSettings().shareDomain.trim().replace(/\/+$/, '');
  const base = domain || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/oauth/callback`;
}

// Some IdPs don't send given_name/family_name at all, and some send a
// full display name under given_name because of a sloppy attribute
// mapping (e.g. LDAP "cn" wired straight to given_name) - either way we
// end up with one field holding "First Last" and the other empty. Split
// on the last space in that case rather than showing the full name
// crammed into the first-name field.
function resolveNameParts(rawFirst, rawLast, fallbackFullName) {
  if (rawFirst && !rawLast && rawFirst.trim().includes(' ')) {
    const parts = rawFirst.trim().split(/\s+/);
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
  }
  if (!rawFirst && !rawLast && fallbackFullName && fallbackFullName.trim().includes(' ')) {
    const parts = fallbackFullName.trim().split(/\s+/);
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
  }
  return { firstName: rawFirst || fallbackFullName || null, lastName: rawLast || null };
}

router.get('/oauth/login', async (req, res) => {
  const config = await getOidcConfig().catch((err) => {
    console.error('OAuth discovery failed', err);
    return null;
  });
  if (!config) return res.redirect('/?oauthError=OAUTH_NOT_CONFIGURED');

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  // Recovered in /oauth/callback to validate the response - this is what
  // ties the redirect back to the browser session that started it.
  req.session.oauthFlow = { codeVerifier, state, nonce };

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(req),
    scope: getSettings().oauthScopes || 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  res.redirect(url.href);
});

router.get('/oauth/callback', async (req, res) => {
  const flow = req.session.oauthFlow;
  delete req.session.oauthFlow;
  if (!flow) return res.redirect('/?oauthError=OAUTH_LOGIN_FAILED');

  const config = await getOidcConfig().catch((err) => {
    console.error('OAuth discovery failed', err);
    return null;
  });
  if (!config) return res.redirect('/?oauthError=OAUTH_NOT_CONFIGURED');

  const currentUrl = new URL(req.originalUrl, redirectUri(req));

  let tokens;
  try {
    tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: flow.codeVerifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
  } catch (err) {
    console.error('OAuth token exchange failed', err);
    return res.redirect('/?oauthError=OAUTH_LOGIN_FAILED');
  }

  const claims = tokens.claims();
  const userinfo = await client.fetchUserInfo(config, tokens.access_token, claims.sub).catch(() => null);

  const email = claims.email || userinfo?.email || null;
  const fullNameClaim = claims.name || userinfo?.name || null;
  const { firstName, lastName } = resolveNameParts(
    claims.given_name || userinfo?.given_name || null,
    claims.family_name || userinfo?.family_name || null,
    fullNameClaim
  );
  // Only trust the email enough to link it to an *existing* local account
  // when the IdP actually vouches for it - otherwise anyone who can register
  // any address at the IdP could take over an existing account here.
  const emailVerified = Boolean(claims.email_verified ?? userinfo?.email_verified ?? false);
  const displayName =
    claims.preferred_username || claims.name || userinfo?.preferred_username || userinfo?.name || email?.split('@')[0];
  const subjectKey = oauthSubjectFor(config, claims.sub);

  let user = findByOauthSubject(subjectKey);
  let isNewUser = false;

  if (!user && email && emailVerified) {
    const existing = findByEmail(email);
    if (existing) user = linkOauthSubject(existing.id, subjectKey, email);
  }

  if (!user) {
    const base = sanitizeSegment((displayName || 'user').toLowerCase().replace(/[^a-z0-9._-]+/g, '-')) || 'user';
    const username = uniqueUsernameFrom(base);
    try {
      user = createOauthUser(username, email, subjectKey, firstName, lastName);
      isNewUser = true;
      await getMinioClient().putObject(getSettings().bucket, `${homePrefix(username)}.keep`, Buffer.alloc(0));
    } catch (err) {
      console.error('OAuth auto-provisioning failed', err);
      return res.redirect('/?oauthError=OAUTH_PROVISIONING_FAILED');
    }
  }

  // Keep name/email in sync with the IdP on every login - but only for
  // whatever it actually sent this time, so a provider that omits a claim
  // doesn't blank out a value we already had from an earlier login.
  if (!isNewUser && (firstName || lastName || email)) {
    user = updateProfileDetails(user.id, {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: email || undefined,
    });
  }

  req.session.authenticated = true;
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.isAdmin = Boolean(user.isAdmin ?? user.is_admin);
  req.session.authMethod = 'oauth';
  logActivity({
    userId: user.id,
    username: user.username,
    action: 'login',
    detail: 'oauth',
    userAgent: req.headers['user-agent'],
  });

  res.redirect('/');
});

export default router;
