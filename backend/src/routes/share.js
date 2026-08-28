import { Router } from 'express';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import { getMinioClient } from '../minioClient.js';
import db from '../db.js';
import { basename, isValidEmail } from '../utils.js';
import { requireAuth } from '../auth.js';
import { getSettings } from '../settings.js';
import { downloadMessage } from '../downloadMessages.js';
import { renderMessagePage, renderSharePage } from '../sharePage.js';
import { isAdmin, isWithinAllowed } from '../permissions.js';
import { logActivity, listShareEmailInvites } from '../activity.js';
import { sendMail } from '../mailer.js';
import { renderShareEmail } from '../emailTemplates.js';

const router = Router();
const MAX_SHARE_EMAIL_RECIPIENTS = 20;

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

function findActiveShare(key) {
  const now = new Date().toISOString();
  return db
    .prepare(
      'SELECT token, expires_at, preview_enabled FROM shares WHERE object_key = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1'
    )
    .get(key, now);
}

function shareDto(req, row) {
  return {
    token: row.token,
    expiresAt: row.expires_at,
    previewEnabled: Boolean(row.preview_enabled),
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

router.post('/share', requireAuth, (req, res) => {
  const { key, expiresAt, previewEnabled } = req.body;
  if (!key) return res.status(400).json({ error: 'MISSING_KEY' });
  if (!isAdmin(req) && !isWithinAllowed(req, key)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
    return res.status(400).json({ error: 'INVALID_EXPIRES_AT' });
  }

  const preview = Boolean(previewEnabled);
  const existing = findActiveShare(key);
  if (existing) {
    // Reopening the share dialog and saving edits updates the existing link
    // in place - expiry and preview reflect whatever was just submitted,
    // not whatever was picked when it was first created.
    db.prepare('UPDATE shares SET expires_at = ?, preview_enabled = ? WHERE token = ?').run(
      expiresAt || null,
      preview ? 1 : 0,
      existing.token
    );
    logActivity({
      userId: req.session.userId,
      username: req.session.username,
      action: 'share',
      objectKey: key,
      detail: existing.token,
    });
    return res.json(shareDto(req, { token: existing.token, expires_at: expiresAt || null, preview_enabled: preview ? 1 : 0 }));
  }

  const token = nanoid(24);
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO shares (token, object_key, file_name, created_at, expires_at, preview_enabled) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(token, key, basename(key), now, expiresAt || null, preview ? 1 : 0);

  logActivity({ userId: req.session.userId, username: req.session.username, action: 'share', objectKey: key, detail: token });
  res
    .status(201)
    .json(shareDto(req, { token, expires_at: expiresAt || null, preview_enabled: preview ? 1 : 0 }));
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
  const row = db.prepare('SELECT object_key FROM shares WHERE token = ?').get(req.params.token);
  if (row && !isAdmin(req) && !isWithinAllowed(req, row.object_key)) {
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
  const row = db
    .prepare('SELECT object_key, file_name, expires_at, preview_enabled FROM shares WHERE token = ?')
    .get(req.params.token);
  if (!row) return res.status(404).send(renderMessagePage(lang, downloadMessage(req, 'linkNotFound')));
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    logActivity({ action: 'share_expired_access', objectKey: row.object_key, detail: req.params.token });
    db.prepare('DELETE FROM shares WHERE token = ?').run(req.params.token);
    return res.status(410).send(renderMessagePage(lang, downloadMessage(req, 'linkExpired')));
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

// Intentionally unauthenticated: serves the actual bytes, used both as the
// <img>/<video>/<audio> source on the preview page (inline) and by its
// "Save" button (?download=1 -> attachment). Supports Range requests since
// video/audio playback and seeking generally require it.
router.get('/share/:token/download', async (req, res) => {
  const row = db
    .prepare('SELECT object_key, file_name, expires_at FROM shares WHERE token = ?')
    .get(req.params.token);
  if (!row) return res.status(404).send(downloadMessage(req, 'linkNotFound'));
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    logActivity({ action: 'share_expired_access', objectKey: row.object_key, detail: req.params.token });
    db.prepare('DELETE FROM shares WHERE token = ?').run(req.params.token);
    return res.status(410).send(downloadMessage(req, 'linkExpired'));
  }

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

    const disposition = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(row.file_name)}"`);

    // A Range request is the browser resuming/seeking within the same
    // playback (e.g. video scrubbing), not a new download - only the initial
    // full/attachment request counts.
    if (range.type === 'none') {
      logActivity({ action: 'download', objectKey: row.object_key, detail: req.params.token, bytes: stat.size });
    }

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
