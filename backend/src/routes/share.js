import crypto from 'node:crypto';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import { getMinioClient } from '../minioClient.js';
import db from '../db.js';
import { basename, isValidEmail } from '../utils.js';
import { requireAuth } from '../auth.js';
import { getSettings } from '../settings.js';
import { downloadMessage } from '../downloadMessages.js';
import { renderMessagePage, renderPasswordPage, renderSharePage } from '../sharePage.js';
import { hashPassword, verifyPassword } from '../password.js';
import { isAdmin, isWithinAllowed } from '../permissions.js';
import { logActivity, listShareEmailInvites } from '../activity.js';
import { sendMail } from '../mailer.js';
import { renderShareEmail } from '../emailTemplates.js';

const router = Router();
const MAX_SHARE_EMAIL_RECIPIENTS = 20;
const MIN_SHARE_PASSWORD_LENGTH = 4;
const MAX_DOWNLOADS_LIMIT = 1_000_000;
const UNLOCK_COOKIE = 'share_unlock';
const UNLOCK_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function buildShareUrl(req, token) {
  const domain = getSettings().shareDomain.trim().replace(/\/+$/, '');
  const base = domain || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/share/${token}`;
}

function detectLang(req) {
  return (req.headers['accept-language'] || '').toLowerCase().startsWith('en') ? 'en' : 'de';
}

function mediaCategory(contentType) {
  if (!contentType) return null;
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return null;
}

// Parses a "Range: bytes=..." header against a known total size.
// { type: 'none' } - no/unusable header, serve the full file.
// { type: 'range', start, end } - a valid byte range.
// { type: 'invalid' } - syntactically a range, but out of bounds -> 416.
function parseRange(rangeHeader, size) {
  if (!rangeHeader) return { type: 'none' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return { type: 'none' };
  const [, startStr, endStr] = match;
  if (startStr === '' && endStr === '') return { type: 'none' };

  let start;
  let end;
  if (startStr === '') {
    const suffixLength = parseInt(endStr, 10);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === '' ? size - 1 : Math.min(parseInt(endStr, 10), size - 1);
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || start >= size) {
    return { type: 'invalid' };
  }
  return { type: 'range', start, end };
}

// The only types ever served inline: ones a browser renders as passive
// media. The content-type comes from whoever uploaded the file, and these
// bytes are served from the app's own origin - an inline text/html or
// image/svg+xml would run the uploader's script with the viewer's session.
// Everything else is always a download.
const INLINE_SAFE_TYPE = /^(image\/(png|jpeg|gif|webp|avif|bmp)|video\/[\w.+-]+|audio\/[\w.+-]+)$/;

function isInlineSafe(contentType) {
  return INLINE_SAFE_TYPE.test(contentType.split(';')[0].trim().toLowerCase());
}

function isExhausted(row) {
  return row.max_downloads !== null && row.download_count >= row.max_downloads;
}

// Proof that this browser entered the right password for this share, kept
// in a cookie scoped to the share's own path. It's derived from the stored
// hash, so changing or removing the password invalidates every earlier
// unlock without any server-side state.
function unlockProof(token, passwordHash) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(`${token}:${passwordHash}`).digest('base64url');
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function isUnlocked(req, row) {
  if (!row.password_hash) return true;
  const given = Buffer.from(readCookie(req, UNLOCK_COOKIE) || '');
  const expected = Buffer.from(unlockProof(row.token, row.password_hash));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// Shared by the public share routes: the row if the link can still be used,
// otherwise the status and message key to answer with. An expired link is
// cleaned up on the spot; an exhausted one stays, so its owner can still
// raise the limit.
function resolvePublicShare(req) {
  const { token } = req.params;
  const row = db.prepare('SELECT * FROM shares WHERE token = ?').get(token);
  if (!row) return { status: 404, message: 'linkNotFound' };
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    logActivity({ action: 'share_expired_access', objectKey: row.object_key, detail: token });
    db.prepare('DELETE FROM shares WHERE token = ?').run(token);
    return { status: 410, message: 'linkExpired' };
  }
  if (isExhausted(row)) return { status: 410, message: 'linkExhausted' };
  return { row };
}

function findActiveShare(key) {
  const now = new Date().toISOString();
  return db
    .prepare(
      'SELECT * FROM shares WHERE object_key = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1'
    )
    .get(key, now);
}

function shareDto(req, row) {
  return {
    token: row.token,
    expiresAt: row.expires_at,
    previewEnabled: Boolean(row.preview_enabled),
    hasPassword: Boolean(row.password_hash),
    maxDownloads: row.max_downloads,
    downloadCount: row.download_count,
    url: buildShareUrl(req, row.token),
  };
}

// Lets the share dialog show/edit an already-existing share (expiry, preview)
// without the caller having to create one first.
router.get('/share', requireAuth, (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'MISSING_KEY' });
  if (!isAdmin(req) && !isWithinAllowed(req, key)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const existing = findActiveShare(key);
  res.json({ share: existing ? shareDto(req, existing) : null });
});

// Who this file's share link has already been emailed to, so the share
// dialog can show "already invited" instead of the sender having to
// remember or accidentally re-inviting the same person.
router.get('/share/invites', requireAuth, (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'MISSING_KEY' });
  if (!isAdmin(req) && !isWithinAllowed(req, key)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  res.json({ invites: listShareEmailInvites(key) });
});

// password: a non-empty string sets/replaces it, anything else keeps the
// current one (it's never echoed back, so a blank field isn't "clear it") -
// removePassword: true is the explicit way to drop it. maxDownloads: null
// for unlimited, a positive integer for a limit, omitted to keep the
// current setting.
router.post('/share', requireAuth, (req, res) => {
  const { key, expiresAt, previewEnabled, password, removePassword, maxDownloads } = req.body;
  if (!key) return res.status(400).json({ error: 'MISSING_KEY' });
  if (!isAdmin(req) && !isWithinAllowed(req, key)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
    return res.status(400).json({ error: 'INVALID_EXPIRES_AT' });
  }
  if (password && (typeof password !== 'string' || password.length < MIN_SHARE_PASSWORD_LENGTH)) {
    return res.status(400).json({ error: 'INVALID_SHARE_PASSWORD' });
  }
  if (
    maxDownloads !== undefined &&
    maxDownloads !== null &&
    (!Number.isInteger(maxDownloads) || maxDownloads < 1 || maxDownloads > MAX_DOWNLOADS_LIMIT)
  ) {
    return res.status(400).json({ error: 'INVALID_MAX_DOWNLOADS' });
  }

  const preview = Boolean(previewEnabled);
  const existing = findActiveShare(key);
  const passwordHash = removePassword
    ? null
    : password
      ? hashPassword(password)
      : (existing?.password_hash ?? null);
  const limit = maxDownloads !== undefined ? maxDownloads : (existing?.max_downloads ?? null);

  if (existing) {
    // Reopening the share dialog and saving edits updates the existing link
    // in place - expiry and preview reflect whatever was just submitted,
    // not whatever was picked when it was first created. The download count
    // carries over, so raising the limit re-opens an exhausted link.
    db.prepare(
      'UPDATE shares SET expires_at = ?, preview_enabled = ?, password_hash = ?, max_downloads = ? WHERE token = ?'
    ).run(expiresAt || null, preview ? 1 : 0, passwordHash, limit, existing.token);
    logActivity({
      userId: req.session.userId,
      username: req.session.username,
      action: 'share',
      objectKey: key,
      detail: existing.token,
    });
    return res.json(shareDto(req, db.prepare('SELECT * FROM shares WHERE token = ?').get(existing.token)));
  }

  const token = nanoid(24);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO shares (token, object_key, file_name, created_at, expires_at, preview_enabled, created_by, password_hash, max_downloads)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(token, key, basename(key), now, expiresAt || null, preview ? 1 : 0, req.session.userId, passwordHash, limit);

  logActivity({ userId: req.session.userId, username: req.session.username, action: 'share', objectKey: key, detail: token });
  res.status(201).json(shareDto(req, db.prepare('SELECT * FROM shares WHERE token = ?').get(token)));
});

// Every still-active share link the current user created - or, for admins,
// everyone's - for the "My shares" overview. Views are counted per link from
// the activity log; downloads come from the link's own counter, which is
// also what the download limit is checked against.
router.get('/my-shares', requireAuth, (req, res) => {
  const admin = isAdmin(req);
  const rows = db
    .prepare(
      `SELECT s.*, u.username AS created_by_username,
         (SELECT COUNT(*) FROM activity a
          WHERE a.object_key = s.object_key AND a.action = 'view' AND a.detail = s.token) AS views
       FROM shares s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE (s.expires_at IS NULL OR s.expires_at > ?) ${admin ? '' : 'AND s.created_by = ?'}
       ORDER BY s.created_at DESC`
    )
    .all(...[new Date().toISOString(), ...(admin ? [] : [req.session.userId])]);

  res.json({
    shares: rows.map((row) => ({
      ...shareDto(req, row),
      objectKey: row.object_key,
      fileName: row.file_name,
      createdAt: row.created_at,
      createdBy: row.created_by_username,
      views: row.views,
      exhausted: isExhausted(row),
    })),
  });
});

router.get('/shares', requireAuth, (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'MISSING_KEY' });
  if (!isAdmin(req) && !isWithinAllowed(req, key)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const rows = db
    .prepare('SELECT token, created_at FROM shares WHERE object_key = ? ORDER BY created_at DESC')
    .all(key);
  res.json({ shares: rows });
});

router.delete('/share/:token', requireAuth, (req, res) => {
  const row = db.prepare('SELECT object_key, created_by FROM shares WHERE token = ?').get(req.params.token);
  // The creator can always revoke their own link, even for a file that has
  // since been moved out of their reach - it's listed in their overview.
  const mayRevoke = row && (isAdmin(req) || isWithinAllowed(req, row.object_key) || row.created_by === req.session.userId);
  if (row && !mayRevoke) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  db.prepare('DELETE FROM shares WHERE token = ?').run(req.params.token);
  if (row) {
    logActivity({
      userId: req.session.userId,
      username: req.session.username,
      action: 'unshare',
      objectKey: row.object_key,
      detail: req.params.token,
    });
  }
  res.json({ ok: true });
});

// Emails the share link to one or more recipients, each as their own
// individual message (never CC/BCC together - recipients shouldn't see each
// other). The sender address stays whatever the admin configured; only the
// display name changes, to "<username> via <configured from name>", so the
// recipient can tell who actually shared it while replies still land on the
// admin's configured address.
router.post('/share/:token/email', requireAuth, async (req, res) => {
  const row = db
    .prepare('SELECT object_key, file_name, expires_at FROM shares WHERE token = ?')
    .get(req.params.token);
  if (!row) return res.status(404).json({ error: 'SHARE_NOT_FOUND' });
  if (!isAdmin(req) && !isWithinAllowed(req, row.object_key)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const settings = getSettings();
  if (!settings.smtpHost) {
    return res.status(400).json({ error: 'SMTP_NOT_CONFIGURED' });
  }

  const { recipients } = req.body || {};
  if (!Array.isArray(recipients)) {
    return res.status(400).json({ error: 'MISSING_RECIPIENTS' });
  }
  const cleaned = [...new Set(recipients.map((r) => String(r || '').trim()).filter(Boolean))];
  if (cleaned.length === 0) {
    return res.status(400).json({ error: 'MISSING_RECIPIENTS' });
  }
  if (cleaned.length > MAX_SHARE_EMAIL_RECIPIENTS) {
    return res.status(400).json({ error: 'TOO_MANY_RECIPIENTS' });
  }
  if (!cleaned.every(isValidEmail)) {
    return res.status(400).json({ error: 'INVALID_RECIPIENT' });
  }

  const url = buildShareUrl(req, req.params.token);
  const { subject, text, html } = renderShareEmail(settings.language, {
    username: req.session.username,
    fileName: row.file_name,
    url,
    expiresAt: row.expires_at,
  });
  // Same URL for every recipient, so the QR code is identical too - generate
  // it once and reuse the buffer rather than per-recipient.
  const qrCodeBuffer = await QRCode.toBuffer(url, { margin: 1, width: 360 });
  const senderSettings = {
    ...settings,
    // getSettings() stores this as the string 'true'/'false', not a real
    // boolean - mailer.js does `Boolean(smtpSecure)`, which is true for
    // *any* non-empty string, so leaving it unconverted silently forces TLS
    // on regardless of what's configured.
    smtpSecure: settings.smtpSecure === 'true',
    smtpFromName: `${req.session.username} via ${settings.smtpFromName || 'filestore'}`,
  };

  const results = await Promise.allSettled(
    cleaned.map((to) =>
      sendMail(senderSettings, {
        to,
        subject,
        text,
        html,
        attachments: [
          {
            filename: 'qrcode.png',
            content: qrCodeBuffer,
            cid: 'shareqrcode',
            contentDisposition: 'inline',
          },
        ],
      })
    )
  );

  results.forEach((result, i) => {
    logActivity({
      userId: req.session.userId,
      username: req.session.username,
      action: result.status === 'fulfilled' ? 'share_email' : 'share_email_failed',
      objectKey: row.object_key,
      detail: cleaned[i],
    });
    if (result.status === 'rejected') console.error(result.reason);
  });

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed === cleaned.length) {
    return res.status(400).json({ error: 'SHARE_EMAIL_FAILED' });
  }
  res.json({ ok: true, sent: cleaned.length - failed, failed, total: cleaned.length });
});

// Intentionally unauthenticated: this is the landing page recipients see
// before downloading - shows an inline preview for images/video/audio. When
// the share was created without preview enabled, there's nothing for this
// page to add, so it hands off straight to the download instead of showing
// itself.
router.get('/share/:token', async (req, res) => {
  const lang = detectLang(req);
  const { row, status, message } = resolvePublicShare(req);
  if (!row) return res.status(status).send(renderMessagePage(lang, downloadMessage(req, message)));

  if (!isUnlocked(req, row)) {
    return res.send(renderPasswordPage({ lang, actionUrl: `/api/share/${row.token}/unlock` }));
  }

  if (!row.preview_enabled) {
    return res.redirect(`/api/share/${req.params.token}/download?download=1`);
  }

  try {
    const bucket = getSettings().bucket;
    const stat = await getMinioClient().statObject(bucket, row.object_key);
    const contentType = stat.metaData?.['content-type'] || 'application/octet-stream';
    const downloadUrl = `/api/share/${req.params.token}/download`;

    logActivity({ action: 'view', objectKey: row.object_key, detail: req.params.token });
    res.send(
      renderSharePage({
        lang,
        fileName: row.file_name,
        size: stat.size,
        category: mediaCategory(contentType),
        downloadUrl,
        saveUrl: `${downloadUrl}?download=1`,
      })
    );
  } catch (err) {
    console.error(err);
    res.status(404).send(renderMessagePage(lang, downloadMessage(req, 'fileNotFound')));
  }
});

// Per IP, only failed attempts count - same idea as the login limiter.
const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res
      .status(429)
      .send(renderPasswordPage({ lang: detectLang(req), actionUrl: `/api/share/${req.params.token}/unlock`, error: 'tooMany' }));
  },
});

// Target of the password page's plain HTML form. On success it sets the
// unlock cookie and sends the browser back to the landing page (303, so a
// reload doesn't re-submit the password).
router.post(
  '/share/:token/unlock',
  unlockLimiter,
  express.urlencoded({ extended: false, limit: '4kb' }),
  (req, res) => {
    const lang = detectLang(req);
    const { row, status, message } = resolvePublicShare(req);
    if (!row) return res.status(status).send(renderMessagePage(lang, downloadMessage(req, message)));

    const landingUrl = `/api/share/${row.token}`;
    if (!row.password_hash) return res.redirect(303, landingUrl);

    if (!verifyPassword(String(req.body?.password || ''), row.password_hash)) {
      logActivity({ action: 'share_password_failed', objectKey: row.object_key, detail: row.token });
      return res.status(401).send(renderPasswordPage({ lang, actionUrl: `${landingUrl}/unlock`, error: 'wrong' }));
    }

    res.cookie(UNLOCK_COOKIE, unlockProof(row.token, row.password_hash), {
      path: landingUrl,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: UNLOCK_MAX_AGE_MS,
    });
    res.redirect(303, landingUrl);
  }
);

// Intentionally unauthenticated: serves the actual bytes, used both as the
// <img>/<video>/<audio> source on the preview page (inline) and by its
// "Save" button (?download=1 -> attachment). Supports Range requests since
// video/audio playback and seeking generally require it.
router.get('/share/:token/download', async (req, res) => {
  const { row, status, message } = resolvePublicShare(req);
  if (!row) return res.status(status).send(downloadMessage(req, message));
  if (!isUnlocked(req, row)) return res.redirect(`/api/share/${row.token}`);

  try {
    const bucket = getSettings().bucket;
    const minioClient = getMinioClient();
    const stat = await minioClient.statObject(bucket, row.object_key);
    const contentType = stat.metaData?.['content-type'] || 'application/octet-stream';
    const range = parseRange(req.headers.range, stat.size);

    if (range.type === 'invalid') {
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      return res.status(416).end();
    }

    const inline = !req.query.download && row.preview_enabled && isInlineSafe(contentType);
    const disposition = inline ? 'inline' : 'attachment';

    // A download is an attachment request that starts at the first byte -
    // a Range request further in is a resume or a download manager fetching
    // the rest of the same file. Inline playback on the preview page (and
    // its seeking) never counts, so a limit caps downloads, not previews.
    // The count is claimed atomically, so parallel requests can't overshoot
    // the limit.
    if (!inline && (range.type === 'none' || range.start === 0)) {
      const claimed = db
        .prepare(
          'UPDATE shares SET download_count = download_count + 1 WHERE token = ? AND (max_downloads IS NULL OR download_count < max_downloads)'
        )
        .run(row.token).changes;
      if (!claimed) {
        return res.status(410).send(downloadMessage(req, 'linkExhausted'));
      }
      logActivity({ action: 'download', objectKey: row.object_key, detail: row.token, bytes: stat.size });
    }

    res.setHeader('Accept-Ranges', 'bytes');
    // Defence in depth for INLINE_SAFE_TYPE: no sniffing an allowed type into
    // something executable, and a sandboxed, script-less document if it's
    // ever rendered anyway.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox"
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(row.file_name)}"`);

    if (range.type === 'range') {
      const length = range.end - range.start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
      res.setHeader('Content-Length', length);
      const stream = await minioClient.getPartialObject(bucket, row.object_key, range.start, length);
      stream.pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      const stream = await minioClient.getObject(bucket, row.object_key);
      stream.pipe(res);
    }
  } catch (err) {
    console.error(err);
    res.status(404).send(downloadMessage(req, 'fileNotFound'));
  }
});

export default router;
