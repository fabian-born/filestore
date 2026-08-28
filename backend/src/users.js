import crypto from 'node:crypto';
import db from './db.js';
import { hashPassword, verifyPassword } from './password.js';
import { sanitizeSegment } from './utils.js';

// Burned on every failed lookup so a nonexistent username takes the same
// time as a wrong password against a real one, not less.
const DUMMY_HASH = hashPassword('not-a-real-password');

export function bootstrapAdmin() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (c > 0) return;
  const username = sanitizeSegment(process.env.AUTH_USERNAME);
  const password = process.env.AUTH_PASSWORD;
  if (!username || !password) return;
  db.prepare('INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)').run(
    username,
    hashPassword(password),
    new Date().toISOString()
  );
}

function toDto(row) {
  return {
    id: row.id,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    email: row.email || '',
  };
}

export function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function findByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function findByOauthSubject(oauthSubject) {
  return db.prepare('SELECT * FROM users WHERE oauth_subject = ?').get(oauthSubject);
}

export function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
}

// Picks the first username derived from `base` that nobody has taken yet,
// appending -2, -3, ... on collision (auto-provisioning has no chance to ask
// the end user for a different name).
export function uniqueUsernameFrom(base) {
  let candidate = base;
  let n = 2;
  while (findByUsername(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

export function linkOauthSubject(id, oauthSubject, email) {
  db.prepare('UPDATE users SET oauth_subject = ?, email = COALESCE(email, ?) WHERE id = ?').run(
    oauthSubject,
    email || null,
    id
  );
  return findById(id);
}

// Auto-provisioned on first OAuth login: no local password, so this account
// can only ever sign in through the IdP.
export function createOauthUser(username, email, oauthSubject, firstName, lastName) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO users (username, password_hash, is_admin, created_at, email, oauth_subject, first_name, last_name) VALUES (?, ?, 0, ?, ?, ?, ?, ?)'
    )
    .run(username, hashPassword(crypto.randomUUID()), now, email || null, oauthSubject, firstName || null, lastName || null);
  return toDto({
    id: info.lastInsertRowid,
    username,
    is_admin: 0,
    created_at: now,
    email: email || null,
    oauth_subject: oauthSubject,
    first_name: firstName || null,
    last_name: lastName || null,
  });
}

// Partial update - a field left undefined keeps its current value, so both
// the local self-service profile edit and the OAuth login-time sync (which
// only ever supplies whatever the IdP actually sent) can share this.
export function updateProfileDetails(id, { firstName, lastName, email }) {
  const current = findById(id);
  if (!current) return null;
  db.prepare('UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?').run(
    firstName !== undefined ? firstName || null : current.first_name,
    lastName !== undefined ? lastName || null : current.last_name,
    email !== undefined ? email || null : current.email,
    id
  );
  return findById(id);
}

export function verifyLogin(username, password) {
  const user = username ? findByUsername(username) : null;
  const ok = verifyPassword(password || '', user ? user.password_hash : DUMMY_HASH);
  return ok ? user : null;
}

export function listUsers() {
  return db.prepare('SELECT * FROM users ORDER BY created_at ASC').all().map(toDto);
}

export function createUser(username, password, isAdmin) {
  const now = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?)')
    .run(username, hashPassword(password), isAdmin ? 1 : 0, now);
  return toDto({ id: info.lastInsertRowid, username, is_admin: isAdmin ? 1 : 0, created_at: now });
}

export function updatePassword(id, password) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
}

export function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function countAdmins() {
  return db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get().c;
}
