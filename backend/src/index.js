import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { ensureBucket, getMinioClient } from './minioClient.js';
import authRouter from './routes/auth.js';
import oauthRouter from './routes/oauth.js';
import filesRouter from './routes/files.js';
import shareRouter from './routes/share.js';
import settingsRouter from './routes/settings.js';
import profileRouter from './routes/profile.js';
import usersRouter from './routes/users.js';
import adminRouter from './routes/admin.js';
import activityRouter from './routes/activity.js';
import versionRouter from './routes/version.js';
import { requireAuth, syncSessionUser } from './auth.js';
import { getSettings } from './settings.js';
import { bootstrapAdmin, listUsers } from './users.js';
import { homePrefix, SHARED_PREFIX } from './permissions.js';

// Anyone who knows the signing secret can forge a session cookie for any
// user, so a missing one is fatal rather than silently falling back to a
// well-known default.
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error('SESSION_SECRET is not set - refusing to start. Generate one with `openssl rand -hex 32`.');
  process.exit(1);
}
if (SESSION_SECRET === 'changeme') {
  console.warn('SESSION_SECRET is still the example value "changeme" - replace it with a random string.');
}

bootstrapAdmin();

// Self-healing: (re)creates the shared folder and any missing per-user home
// folders on every boot, so a fresh MinIO bucket or a manually deleted
// folder doesn't lock anyone out of browsing.
async function ensureStructureFolders() {
  const bucket = getSettings().bucket;
  const client = getMinioClient();
  const keys = [`${SHARED_PREFIX}.keep`, ...listUsers().map((u) => `${homePrefix(u.username)}.keep`)];
  for (const key of keys) {
    const exists = await client.statObject(bucket, key).then(
      () => true,
      () => false
    );
    if (!exists) await client.putObject(bucket, key, Buffer.alloc(0));
  }
}

// How many reverse proxies sit in front of the backend - req.ip (and so the
// per-IP login rate limit) is read from X-Forwarded-For that many hops back.
// The default 1 is the bundled nginx; add one for every proxy in front of it
// (e.g. TRUST_PROXY=2 behind Traefik/Caddy), otherwise every client shares
// that outer proxy's IP. Non-numeric values go to Express as-is.
const trustProxy = process.env.TRUST_PROXY ?? '1';

const app = express();
app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 4 * 60 * 60 * 1000,
    },
  })
);
app.use(syncSessionUser);

// requireAuth here is a plain middleware, not scoped to filesRouter's own
// routes - mounted at the bare '/api' prefix it would otherwise 401 every
// request that doesn't match one of filesRouter's routes before it ever
// reaches the routers below, including the ones with intentionally public
// endpoints (share downloads, the pre-login /settings, OAuth). So it must be
// mounted last, after every router that needs to handle unauthenticated
// requests itself.
app.use('/api', authRouter);
app.use('/api', oauthRouter);
app.use('/api', shareRouter);
app.use('/api', settingsRouter);
app.use('/api', profileRouter);
app.use('/api', usersRouter);
app.use('/api', adminRouter);
app.use('/api', activityRouter);
app.use('/api', versionRouter);
app.use('/api', requireAuth, filesRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3452;

// Don't let a missing/unreachable MinIO connection block startup: the app
// must still come up so the user can log in and complete the setup wizard.
ensureBucket(getSettings().bucket)
  .then(() => ensureStructureFolders())
  .catch((err) => {
    console.error('MinIO bucket not available at startup - complete setup in the app.', err.message);
  })
  .finally(() => {
    app.listen(PORT, () => console.log(`Backend listening on :${PORT}`));
  });
