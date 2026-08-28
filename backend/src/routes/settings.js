import { Router } from 'express';
import * as client from 'openid-client';
import { requireAuth, requireLocalAdmin, requireAdmin } from '../auth.js';
import { getSettings, updateSettings, isOauthEnabled } from '../settings.js';
import { buildClient, ensureBucket } from '../minioClient.js';
import { invalidateOidcConfig } from '../oauth.js';
import { isAdmin } from '../permissions.js';
import { sendMail } from '../mailer.js';
import { logActivity } from '../activity.js';
import { isValidEmail } from '../utils.js';

const router = Router();
const SUPPORTED_LANGUAGES = ['de', 'en'];
const BUCKET_FIELDS = ['bucket', 'minioUrl', 'minioAccessKey', 'minioSecretKey'];

// Bucket/MinIO connection details (and SMTP credentials) are admin-only - a
// regular user has no business seeing (or changing) that infrastructure
// config. They still need to know *whether* the bucket is configured though
// (bucketConfigured), so the app can tell "setup pending" from
// "everything's fine" without leaking the actual connection details to them.
function withoutSecret(settings, admin) {
  const {
    minioSecretKey,
    oauthClientSecret,
    bucket,
    minioUrl,
    minioAccessKey,
    smtpHost,
    smtpPort,
    smtpUsername,
    smtpPassword,
    smtpFromAddress,
    smtpFromName,
    smtpSecure,
    defaultQuotaGb,
    ...rest
  } = settings;
  const result = {
    ...rest,
    oauthEnabled: isOauthEnabled(settings),
    oauthClientSecretSet: Boolean(oauthClientSecret),
    bucketConfigured: Boolean(minioAccessKey && minioSecretKey),
    // Any user who can share a file needs to know whether "send by email" is
    // available - without seeing the actual SMTP credentials.
    smtpConfigured: Boolean(smtpHost),
  };
  if (admin) {
    result.bucket = bucket;
    result.minioUrl = minioUrl;
    result.minioAccessKey = minioAccessKey;
    result.minioSecretKeySet = Boolean(minioSecretKey);
    result.smtpHost = smtpHost;
    result.smtpPort = smtpPort;
    result.smtpUsername = smtpUsername;
    result.smtpFromAddress = smtpFromAddress;
    result.smtpFromName = smtpFromName;
    result.smtpSecure = smtpSecure === 'true';
    result.smtpPasswordSet = Boolean(smtpPassword);
    result.defaultQuotaGb = Number(defaultQuotaGb) || 0;
  }
  return result;
}

// Public: the login screen needs the configured language and whether an
// OAuth login option should be offered before the user is authenticated.
// Everything else here (bucket, MinIO connection, OAuth client details, ...)
// is sensitive infrastructure config, so unauthenticated callers don't get it.
router.get('/settings', (req, res) => {
  const settings = getSettings();
  if (!req.session?.authenticated) {
    return res.json({
      language: settings.language,
      oauthEnabled: isOauthEnabled(settings),
      oauthButtonLabel: settings.oauthButtonLabel || '',
    });
  }
  res.json(withoutSecret(settings, isAdmin(req)));
});

router.put('/settings', requireAuth, async (req, res) => {
  const { shareDomain, language, bucket, minioUrl, minioAccessKey, minioSecretKey, defaultQuotaGb } =
    req.body || {};

  // Bucket/MinIO connection, the share domain and the default quota are
  // infrastructure-level settings - only admins may change them. Language
  // stays open to everyone.
  const restrictedFieldSent =
    shareDomain !== undefined ||
    defaultQuotaGb !== undefined ||
    BUCKET_FIELDS.some((f) => req.body?.[f] !== undefined);
  if (!isAdmin(req) && restrictedFieldSent) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  if (language !== undefined && !SUPPORTED_LANGUAGES.includes(language)) {
    return res.status(400).json({ error: 'INVALID_LANGUAGE' });
  }
  if (shareDomain !== undefined && typeof shareDomain !== 'string') {
    return res.status(400).json({ error: 'INVALID_SHARE_DOMAIN' });
  }
  if (defaultQuotaGb !== undefined && (typeof defaultQuotaGb !== 'number' || defaultQuotaGb < 0)) {
    return res.status(400).json({ error: 'INVALID_QUOTA' });
  }
  if (bucket !== undefined && (typeof bucket !== 'string' || !bucket.trim())) {
    return res.status(400).json({ error: 'INVALID_BUCKET' });
  }
  if (minioUrl !== undefined && (typeof minioUrl !== 'string' || !minioUrl.trim())) {
    return res.status(400).json({ error: 'INVALID_MINIO_URL' });
  }
  if (minioAccessKey !== undefined && typeof minioAccessKey !== 'string') {
    return res.status(400).json({ error: 'INVALID_MINIO_ACCESS_KEY' });
  }
  if (minioSecretKey !== undefined && typeof minioSecretKey !== 'string') {
    return res.status(400).json({ error: 'INVALID_MINIO_SECRET_KEY' });
  }

  const current = getSettings();
  const trimmedBucket = bucket !== undefined ? bucket.trim() : undefined;
  const trimmedMinioUrl = minioUrl !== undefined ? minioUrl.trim() : undefined;
  const trimmedAccessKey = minioAccessKey !== undefined ? minioAccessKey.trim() : undefined;

  // An empty secret key means "keep the existing one" - it is never echoed
  // back to the client, so a blank field does not mean "clear it".
  const effective = {
    bucket: trimmedBucket ?? current.bucket,
    minioUrl: trimmedMinioUrl ?? current.minioUrl,
    minioAccessKey: trimmedAccessKey ?? current.minioAccessKey,
    minioSecretKey: minioSecretKey || current.minioSecretKey,
  };

  const connectionChanged =
    effective.bucket !== current.bucket ||
    effective.minioUrl !== current.minioUrl ||
    effective.minioAccessKey !== current.minioAccessKey ||
    Boolean(minioSecretKey && minioSecretKey !== current.minioSecretKey);

  if (connectionChanged) {
    try {
      const testClient = buildClient(effective);
      await ensureBucket(effective.bucket, testClient);
    } catch (err) {
      console.error(err);
      return res.status(400).json({ error: 'BUCKET_UNAVAILABLE' });
    }
  }

  try {
    const settings = updateSettings({
      shareDomain: shareDomain !== undefined ? shareDomain.trim() : undefined,
      language,
      bucket: trimmedBucket,
      minioUrl: trimmedMinioUrl,
      minioAccessKey: trimmedAccessKey,
      minioSecretKey: minioSecretKey ? minioSecretKey : undefined,
      defaultQuotaGb: defaultQuotaGb !== undefined ? String(defaultQuotaGb) : undefined,
    });
    // Only the admin-only fields are audit-worthy - a regular user changing
    // their own language preference isn't a config change.
    if (restrictedFieldSent) {
      logActivity({
        userId: req.session.userId,
        username: req.session.username,
        action: 'settings_change',
        detail: `general: ${Object.keys(req.body || {})
          .filter((f) => f !== 'language')
          .join(', ')}`,
      });
    }
    res.json(withoutSecret(settings, isAdmin(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SETTINGS_FAILED' });
  }
});

// Shared by the save path (only when enabling) and the explicit test button
// (always, so it works before OAuth login is switched on). Throws with an
// { error } shape ready to send straight back to the client.
async function discoverOrThrow(issuer, clientId, clientSecret) {
  if (!issuer || !clientId) throw { error: 'INVALID_OAUTH_ISSUER' };
  let issuerUrl;
  try {
    issuerUrl = new URL(issuer);
  } catch {
    throw { error: 'INVALID_OAUTH_ISSUER' };
  }
  try {
    await client.discovery(issuerUrl, clientId, clientSecret || undefined);
  } catch (err) {
    console.error(err);
    throw { error: 'OAUTH_DISCOVERY_FAILED' };
  }
}

// Lets an admin verify issuer/client ID/secret before saving (or while OAuth
// login is still disabled) - never persists anything.
router.post('/settings/oauth/test', requireLocalAdmin, async (req, res) => {
  const { oauthIssuer, oauthClientId, oauthClientSecret } = req.body || {};
  const current = getSettings();
  const issuer = (oauthIssuer !== undefined ? oauthIssuer : current.oauthIssuer || '').trim();
  const clientId = (oauthClientId !== undefined ? oauthClientId : current.oauthClientId || '').trim();
  const clientSecret = oauthClientSecret || current.oauthClientSecret;

  try {
    await discoverOrThrow(issuer, clientId, clientSecret);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json(err);
  }
});

// Only a locally-authenticated admin session may change these - see
// requireLocalAdmin for why an OAuth-authenticated admin session is excluded.
router.put('/settings/oauth', requireLocalAdmin, async (req, res) => {
  const { oauthEnabled, oauthIssuer, oauthClientId, oauthClientSecret, oauthScopes, oauthButtonLabel } = req.body || {};

  if (oauthEnabled !== undefined && typeof oauthEnabled !== 'boolean') {
    return res.status(400).json({ error: 'INVALID_OAUTH_ENABLED' });
  }
  if (oauthIssuer !== undefined && typeof oauthIssuer !== 'string') {
    return res.status(400).json({ error: 'INVALID_OAUTH_ISSUER' });
  }
  if (oauthClientId !== undefined && typeof oauthClientId !== 'string') {
    return res.status(400).json({ error: 'INVALID_OAUTH_CLIENT_ID' });
  }
  if (oauthClientSecret !== undefined && typeof oauthClientSecret !== 'string') {
    return res.status(400).json({ error: 'INVALID_OAUTH_CLIENT_SECRET' });
  }
  if (oauthScopes !== undefined && (typeof oauthScopes !== 'string' || !oauthScopes.trim())) {
    return res.status(400).json({ error: 'INVALID_OAUTH_SCOPES' });
  }
  if (oauthButtonLabel !== undefined && typeof oauthButtonLabel !== 'string') {
    return res.status(400).json({ error: 'INVALID_OAUTH_BUTTON_LABEL' });
  }

  const current = getSettings();
  const trimmedIssuer = oauthIssuer !== undefined ? oauthIssuer.trim() : undefined;
  const trimmedClientId = oauthClientId !== undefined ? oauthClientId.trim() : undefined;

  const effective = {
    oauthEnabled: oauthEnabled !== undefined ? String(oauthEnabled) : current.oauthEnabled,
    oauthIssuer: trimmedIssuer ?? current.oauthIssuer,
    oauthClientId: trimmedClientId ?? current.oauthClientId,
    // An empty secret means "keep the existing one" - it is never echoed
    // back to the client, so a blank field does not mean "clear it".
    oauthClientSecret: oauthClientSecret || current.oauthClientSecret,
  };

  if (effective.oauthEnabled === 'true') {
    try {
      await discoverOrThrow(effective.oauthIssuer, effective.oauthClientId, effective.oauthClientSecret);
    } catch (err) {
      return res.status(400).json(err);
    }
  }

  try {
    const settings = updateSettings({
      oauthEnabled: effective.oauthEnabled,
      oauthIssuer: trimmedIssuer,
      oauthClientId: trimmedClientId,
      oauthClientSecret: oauthClientSecret ? oauthClientSecret : undefined,
      oauthScopes: oauthScopes !== undefined ? oauthScopes.trim() : undefined,
      oauthButtonLabel: oauthButtonLabel !== undefined ? oauthButtonLabel.trim() : undefined,
    });
    invalidateOidcConfig();
    logActivity({
      userId: req.session.userId,
      username: req.session.username,
      action: 'settings_change',
      detail: `oauth: ${Object.keys(req.body || {}).join(', ')}`,
    });
    res.json(withoutSecret(settings, isAdmin(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SETTINGS_FAILED' });
  }
});

// Admin-only, like the bucket fields.
router.put('/settings/smtp', requireAdmin, (req, res) => {
  const { smtpHost, smtpPort, smtpUsername, smtpPassword, smtpFromAddress, smtpFromName, smtpSecure } =
    req.body || {};

  if (smtpHost !== undefined && typeof smtpHost !== 'string') {
    return res.status(400).json({ error: 'INVALID_SMTP_HOST' });
  }
  if (
    smtpPort !== undefined &&
    smtpPort !== '' &&
    (!Number.isInteger(Number(smtpPort)) || Number(smtpPort) < 1 || Number(smtpPort) > 65535)
  ) {
    return res.status(400).json({ error: 'INVALID_SMTP_PORT' });
  }
  if (smtpUsername !== undefined && typeof smtpUsername !== 'string') {
    return res.status(400).json({ error: 'INVALID_SMTP_USERNAME' });
  }
  if (smtpPassword !== undefined && typeof smtpPassword !== 'string') {
    return res.status(400).json({ error: 'INVALID_SMTP_PASSWORD' });
  }
  if (smtpFromAddress !== undefined && typeof smtpFromAddress !== 'string') {
    return res.status(400).json({ error: 'INVALID_SMTP_FROM_ADDRESS' });
  }
  if (smtpFromName !== undefined && typeof smtpFromName !== 'string') {
    return res.status(400).json({ error: 'INVALID_SMTP_FROM_NAME' });
  }
  if (smtpSecure !== undefined && typeof smtpSecure !== 'boolean') {
    return res.status(400).json({ error: 'INVALID_SMTP_SECURE' });
  }

  try {
    const settings = updateSettings({
      smtpHost: smtpHost !== undefined ? smtpHost.trim() : undefined,
      smtpPort: smtpPort !== undefined ? String(smtpPort).trim() : undefined,
      smtpUsername: smtpUsername !== undefined ? smtpUsername.trim() : undefined,
      // An empty password means "keep the existing one" - it is never echoed
      // back to the client, so a blank field does not mean "clear it".
      smtpPassword: smtpPassword ? smtpPassword : undefined,
      smtpFromAddress: smtpFromAddress !== undefined ? smtpFromAddress.trim() : undefined,
      smtpFromName: smtpFromName !== undefined ? smtpFromName.trim() : undefined,
      smtpSecure: smtpSecure !== undefined ? String(smtpSecure) : undefined,
    });
    logActivity({
      userId: req.session.userId,
      username: req.session.username,
      action: 'settings_change',
      detail: `smtp: ${Object.keys(req.body || {})
        .filter((f) => f !== 'smtpPassword')
        .join(', ')}`,
    });
    res.json(withoutSecret(settings, true));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SETTINGS_FAILED' });
  }
});

// Sends with whatever's currently in the form, not necessarily saved yet -
// same idea as the OAuth test button. Falls back to the saved value for any
// field left blank (particularly the password, which is never echoed back).
router.post('/settings/smtp/test', requireAdmin, async (req, res) => {
  const { to, smtpHost, smtpPort, smtpUsername, smtpPassword, smtpFromAddress, smtpFromName, smtpSecure } =
    req.body || {};

  if (!isValidEmail(to)) {
    return res.status(400).json({ error: 'INVALID_TEST_RECIPIENT' });
  }

  const current = getSettings();
  const effective = {
    smtpHost: (smtpHost !== undefined ? smtpHost : current.smtpHost || '').trim(),
    smtpPort: smtpPort !== undefined ? String(smtpPort).trim() : current.smtpPort,
    smtpUsername: (smtpUsername !== undefined ? smtpUsername : current.smtpUsername || '').trim(),
    smtpPassword: smtpPassword || current.smtpPassword,
    smtpFromAddress: (smtpFromAddress !== undefined ? smtpFromAddress : current.smtpFromAddress || '').trim(),
    smtpFromName: (smtpFromName !== undefined ? smtpFromName : current.smtpFromName || '').trim(),
    smtpSecure: smtpSecure !== undefined ? Boolean(smtpSecure) : current.smtpSecure === 'true',
  };

  if (!effective.smtpHost) {
    return res.status(400).json({ error: 'SMTP_NOT_CONFIGURED' });
  }

  const recipient = to.trim();
  try {
    await sendMail(effective, {
      to: recipient,
      subject: 'webtools - Test-E-Mail',
      text: 'Dies ist eine Test-E-Mail von webtools zur Überprüfung der SMTP-Einstellungen.',
    });
    logActivity({
      userId: req.session.userId,
      username: req.session.username,
      action: 'smtp_test',
      detail: recipient,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    logActivity({
      userId: req.session.userId,
      username: req.session.username,
      action: 'smtp_test_failed',
      detail: recipient,
    });
    res.status(400).json({ error: 'SMTP_TEST_FAILED' });
  }
});

export default router;
