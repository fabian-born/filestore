# Changelog

All notable changes to this project are documented here.
The format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version numbers follow this project's build tagging scheme (`yyyy.mm.dd-buildid`).

## [Unreleased]

### Added
- HTML email templates (German/English) for share-link invites, auto-selected
  from the admin-configured UI language, with the share's QR code embedded
  inline in the email.
- Per-user storage quotas: a global default (admin-configurable, in GB, 0 =
  unlimited) plus an optional per-user override; admins are always
  unlimited. Enforced during upload (aborting mid-stream rather than only
  after the fact), with usage tracked incrementally on upload/delete and a
  usage progress bar shown to each user for their own quota.
- Admin-only file ownership reassignment, for a single file or recursively
  for a whole folder, picking the new owner from the list of registered
  users. Quota usage moves with it (freed from the old owner, charged to
  the new one).
- Rate limiting on login (10 failed attempts per 15 minutes per IP;
  successful logins don't count against the limit).
- `backup.sh` / `backend/scripts/backup-db.js` for online, non-disruptive
  backups of `shares.db` with retention, plus systemd timer/cron examples.
- Owner reassignment for a multi-selection (not just one file/folder at a
  time), a one-click "reassign content" action right on an orphaned user
  folder, and an admin-only storage-usage overview across all users on the
  Stats page.
- Theme switcher (System/Light/Dark) in Settings, defaulting to System
  (i.e. unchanged from before) - a per-browser preference stored in
  localStorage, applied before first paint to avoid a flash of the wrong
  theme.

### Fixed
- Housekeeping: pinned `node`/`nginx` base images to digests, added
  container healthchecks (catching a `localhost` vs `127.0.0.1` resolution
  bug along the way), and moved stray local DB backups into `backups/`.

## [2026.08.27] — First public release

### Added
- Local username/password login plus optional OIDC/OAuth login, gated so
  only a locally-authenticated admin can change OAuth settings.
- File browsing, upload (drag & drop), rename, move and delete against a
  MinIO/S3-compatible bucket.
- Per-file **owner** tracking, recorded on upload and carried through
  rename and move (including admin bulk-move).
- Sharing: expiring share links, optional inline preview (otherwise the
  link goes straight to download), QR code, and emailing the link to
  multiple recipients as individual emails.
- Admin settings: bucket configuration, user management, SMTP settings
  with a send-test-email action, and OAuth configuration with a
  test-connection action.
- Activity log (paginated, filterable) recording logins, uploads, deletes,
  renames, shares and share-email invites.
- Stats page and an App Info tab showing backend/frontend version numbers.
- Orphaned user-folder indicator for home folders whose account was deleted.
- Mobile-responsive UI: collapsible per-row action menu, an info popover
  for file details, icon-only toolbar buttons, and pagination (with
  25/50/100/all page sizes) for both the file listing and the activity log.
- Sortable file listing (name, size, modified date).
- Profile view showing first name, last name and email for both local and
  OAuth accounts.
- German and English UI translations.
