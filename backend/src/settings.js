import db from './db.js';

const envUseSSL = process.env.MINIO_USE_SSL === 'true';
const envPort = process.env.MINIO_PORT || '9000';
const envHost = process.env.MINIO_ENDPOINT || 'localhost';

const DEFAULTS = {
  shareDomain: '',
  language: 'de',
  bucket: process.env.MINIO_BUCKET || 'webtools',
  minioUrl: `${envUseSSL ? 'https' : 'http'}://${envHost}:${envPort}`,
  minioAccessKey: process.env.MINIO_ACCESS_KEY || '',
  minioSecretKey: process.env.MINIO_SECRET_KEY || '',
  oauthEnabled: 'false',
  oauthIssuer: '',
  oauthClientId: '',
  oauthClientSecret: '',
  oauthScopes: 'openid email profile',
  oauthButtonLabel: '',
  smtpHost: '',
  smtpPort: '',
  smtpUsername: '',
  smtpPassword: '',
  smtpFromAddress: '',
  smtpFromName: '',
  smtpSecure: 'false',
};

const KEYS = {
  shareDomain: 'share_domain',
  language: 'language',
  bucket: 'bucket',
  minioUrl: 'minio_url',
  minioAccessKey: 'minio_access_key',
  minioSecretKey: 'minio_secret_key',
  oauthEnabled: 'oauth_enabled',
  oauthIssuer: 'oauth_issuer',
  oauthClientId: 'oauth_client_id',
  oauthClientSecret: 'oauth_client_secret',
  oauthScopes: 'oauth_scopes',
  oauthButtonLabel: 'oauth_button_label',
  smtpHost: 'smtp_host',
  smtpPort: 'smtp_port',
  smtpUsername: 'smtp_username',
  smtpPassword: 'smtp_password',
  smtpFromAddress: 'smtp_from_address',
  smtpFromName: 'smtp_from_name',
  smtpSecure: 'smtp_secure',
};

const FIELDS = Object.keys(KEYS);

const upsert = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);
const upsertMany = db.transaction((entries) => {
  for (const [key, value] of entries) upsert.run(key, value);
});

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  // One-time migration: persist values resolved from env vars (or defaults) so
  // the app no longer depends on those env vars once this has run.
  const missing = FIELDS.filter((f) => map[KEYS[f]] === undefined);
  if (missing.length) {
    upsertMany(missing.map((f) => [KEYS[f], DEFAULTS[f]]));
    missing.forEach((f) => {
      map[KEYS[f]] = DEFAULTS[f];
    });
  }

  const result = {};
  FIELDS.forEach((f) => {
    result[f] = map[KEYS[f]];
  });
  return result;
}

export function updateSettings(partial) {
  const entries = FIELDS.filter((f) => partial[f] !== undefined).map((f) => [KEYS[f], partial[f]]);
  if (entries.length) upsertMany(entries);
  return getSettings();
}

export function isOauthEnabled(settings) {
  return (settings || getSettings()).oauthEnabled === 'true';
}
