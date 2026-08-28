import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'shares.db');
const isNewDatabase = !fs.existsSync(dbPath);

const db = new Database(dbPath);

// Full current schema, one entry per table. Applied unconditionally on every
// boot via CREATE TABLE IF NOT EXISTS - this is what builds a brand new
// database from scratch when shares.db doesn't exist yet, and is a no-op
// against an already up-to-date one.
const TABLES = {
  shares: `
    CREATE TABLE IF NOT EXISTS shares (
      token TEXT PRIMARY KEY,
      object_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `,
  settings: `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `,
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `,
  activity: `
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      object_key TEXT,
      detail TEXT,
      created_at TEXT NOT NULL
    )
  `,
  file_owners: `
    CREATE TABLE IF NOT EXISTS file_owners (
      object_key TEXT PRIMARY KEY,
      owner_id INTEGER,
      owner_username TEXT,
      created_at TEXT NOT NULL
    )
  `,
};

// Columns added to a table after its initial release. CREATE TABLE IF NOT
// EXISTS can't add columns to an existing table, so those go here instead -
// each checked and applied individually on every boot.
const COLUMN_MIGRATIONS = [
  { table: 'shares', column: 'expires_at', ddl: 'ALTER TABLE shares ADD COLUMN expires_at TEXT' },
  { table: 'users', column: 'email', ddl: 'ALTER TABLE users ADD COLUMN email TEXT' },
  { table: 'users', column: 'oauth_subject', ddl: 'ALTER TABLE users ADD COLUMN oauth_subject TEXT' },
  { table: 'users', column: 'first_name', ddl: 'ALTER TABLE users ADD COLUMN first_name TEXT' },
  { table: 'users', column: 'last_name', ddl: 'ALTER TABLE users ADD COLUMN last_name TEXT' },
  {
    table: 'shares',
    column: 'preview_enabled',
    ddl: 'ALTER TABLE shares ADD COLUMN preview_enabled INTEGER NOT NULL DEFAULT 0',
  },
];

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_shares_object_key ON shares(object_key)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_subject ON users(oauth_subject) WHERE oauth_subject IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_activity_user_id ON activity(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_activity_object_key ON activity(object_key)',
  'CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity(created_at)',
];

function tableExists(name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function hasColumn(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
}

// Verifies the database against the schema this version of the app expects
// and applies whatever is missing - new tables, new columns, new indexes.
// Safe to call on every startup: a fully up-to-date database goes through
// untouched, an empty/missing one is built up from nothing, and an older
// one picks up exactly the migrations it's missing.
export function verifyAndMigrate() {
  const changes = [];

  for (const [table, ddl] of Object.entries(TABLES)) {
    const existed = tableExists(table);
    db.exec(ddl);
    if (!existed) changes.push(`Tabelle "${table}" angelegt`);
  }

  for (const { table, column, ddl } of COLUMN_MIGRATIONS) {
    if (!hasColumn(table, column)) {
      db.exec(ddl);
      changes.push(`Spalte "${column}" zu Tabelle "${table}" hinzugefügt`);
    }
  }

  for (const ddl of INDEXES) {
    db.exec(ddl);
  }

  if (isNewDatabase) {
    console.log(`[db] Neue Datenbank angelegt: ${dbPath}`);
  } else if (changes.length > 0) {
    console.log(`[db] Datenbank migriert (${dbPath}):`);
    changes.forEach((change) => console.log(`  - ${change}`));
  } else {
    console.log(`[db] Datenbank verifiziert, keine Änderungen nötig (${dbPath})`);
  }

  return { isNewDatabase, changes };
}

verifyAndMigrate();

export default db;
