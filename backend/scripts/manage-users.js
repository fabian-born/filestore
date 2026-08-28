#!/usr/bin/env node
import Database from 'better-sqlite3';
import path from 'path';
import { hashPassword } from '../src/password.js';

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

function usage() {
  console.log(`Nutzerverwaltung direkt auf der shares.db - fuer den Fall, dass die Weboberflaeche nicht erreichbar ist.

Usage:
  node scripts/manage-users.js --list [--db <pfad>]
  node scripts/manage-users.js --promote <username> [--db <pfad>]
  node scripts/manage-users.js --demote <username> [--db <pfad>]
  node scripts/manage-users.js --reset-password <username> --password <neues-passwort> [--db <pfad>]

--db ist optional, Default: $DATA_DIR/shares.db oder ./data/shares.db

Beispiele:
  node scripts/manage-users.js --list
  node scripts/manage-users.js --promote fabian
  node scripts/manage-users.js --reset-password admin --password "neuesSicheresPasswort123"

Hinweis: vorher ein Backup der .db-Datei ziehen (einfach kopieren). Das Script
sperrt die Datei kurz waehrend des Schreibens - laesst sich in der Regel auch
bei laufendem Backend-Container ausfuehren, aber ein "docker compose stop
webtools-fileexplorer-backend" davor ist die sicherste Variante.
`);
}

function listUsers(db) {
  const rows = db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY id').all();
  if (rows.length === 0) {
    console.log('Keine Nutzer in der Datenbank.');
    return;
  }
  console.table(
    rows.map((r) => ({ id: r.id, username: r.username, admin: Boolean(r.is_admin), created_at: r.created_at }))
  );
}

function requireUser(db, username) {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) {
    console.error(`Kein Nutzer mit Benutzername "${username}" gefunden.`);
    process.exitCode = 1;
    return null;
  }
  return user;
}

function setAdmin(db, username, isAdmin) {
  const user = requireUser(db, username);
  if (!user) return;
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, user.id);
  console.log(`"${username}" ist jetzt ${isAdmin ? 'Admin' : 'kein Admin mehr'}.`);
}

function resetPassword(db, username, password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    console.error('Das Passwort muss mindestens 8 Zeichen lang sein (--password "...").');
    process.exitCode = 1;
    return;
  }
  const user = requireUser(db, username);
  if (!user) return;
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  console.log(`Passwort fuer "${username}" wurde gesetzt.`);
}

const args = parseArgs(process.argv.slice(2));

if (Object.keys(args).length === 0) {
  usage();
  process.exit(0);
}

const dbPath = typeof args.db === 'string' ? args.db : path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'shares.db');

const db = new Database(dbPath);
console.log(`Verwende Datenbank: ${dbPath}\n`);

try {
  if (typeof args.promote === 'string') {
    setAdmin(db, args.promote, true);
    listUsers(db);
  } else if (typeof args.demote === 'string') {
    setAdmin(db, args.demote, false);
    listUsers(db);
  } else if (typeof args['reset-password'] === 'string') {
    resetPassword(db, args['reset-password'], args.password);
  } else if (args.list) {
    listUsers(db);
  } else {
    usage();
  }
} finally {
  db.close();
}
