#!/usr/bin/env node
// Online backup of shares.db via SQLite's own backup API (safe to run while
// the app is using the database - no need to stop anything). Intended to
// run on a schedule (cron/systemd timer); see README.md.
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const dbPath = args.db || path.join(dataDir, 'shares.db');
const backupDir = args.out || path.join(path.dirname(dbPath), 'backups');
const keep = Number(args.keep) || 14;

if (!fs.existsSync(dbPath)) {
  console.error(`[backup] Datenbank nicht gefunden: ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const destPath = path.join(backupDir, `shares-${timestamp}.db`);

const db = new Database(dbPath, { readonly: true });
try {
  await db.backup(destPath);
  console.log(`[backup] Sicherung erstellt: ${destPath}`);
} finally {
  db.close();
}

// Retention: keep only the newest `keep` backups.
const existing = fs
  .readdirSync(backupDir)
  .filter((f) => f.startsWith('shares-') && f.endsWith('.db'))
  .sort()
  .reverse();

for (const stale of existing.slice(keep)) {
  fs.unlinkSync(path.join(backupDir, stale));
  console.log(`[backup] Alte Sicherung gelöscht: ${stale}`);
}
