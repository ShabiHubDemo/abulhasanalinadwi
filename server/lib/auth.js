// Authentication and authorization.
//
// - Passwords: scrypt with a per-user random salt, compared in constant time.
// - Sessions: a random 256-bit token in an HttpOnly, SameSite=Strict cookie.
//   Only its SHA-256 is stored, with idle and absolute expiry.
// - CSRF: every state-changing request must send the session's CSRF token in
//   the X-CSRF-Token header, and its Origin (when sent) must be this site.
// - Roles map to permissions here, in one place; routes ask for a permission,
//   never for a role, and the role always comes from the database.

const crypto = require('crypto');
const config = require('../config');
const { HttpError, parseCookies, serializeCookie } = require('./http');

const COOKIE = 'nc_session';
const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 };

// ---------- roles & permissions ----------
const ROLES = ['user', 'editor', 'admin'];
const PERMISSIONS = {
  user: [],
  editor: ['admin.access', 'dashboard.view', 'content.manage', 'questions.manage'],
  admin: ['admin.access', 'dashboard.view', 'content.manage', 'questions.manage',
    'users.manage', 'settings.manage', 'audit.view'],
};

function can(user, permission) {
  return !!user && user.status === 'active' && (PERMISSIONS[user.role] || []).includes(permission);
}

// ---------- passwords ----------
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);
    const [, N, r, p, saltB64, keyB64] = parts;
    const expected = Buffer.from(keyB64, 'base64');
    crypto.scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) return resolve(false);
      resolve(key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}

// a hash to compare against when the account doesn't exist, so a login for an
// unknown email takes as long as one with a wrong password
let dummyHash = null;
async function burnTime(password) {
  if (!dummyHash) dummyHash = await hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(password, dummyHash);
}

function passwordProblem(password, { email = '', name = '' } = {}) {
  if (typeof password !== 'string' || password.length < 10) return 'Password must be at least 10 characters.';
  if (password.length > 200) return 'Password must be at most 200 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain letters and numbers.';
  const lower = password.toLowerCase();
  if (email && lower.includes(email.split('@')[0].toLowerCase())) return 'Password must not contain your email name.';
  if (name && name.length > 3 && lower.includes(name.toLowerCase())) return 'Password must not contain your name.';
  return null;
}

// ---------- sessions ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const now = () => new Date();
const iso = (d) => d.toISOString();

function createSession(db, userId, { ip, userAgent }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(32).toString('base64url');
  const t = now();
  const expires = new Date(t.getTime() + config.session.absoluteHours * 3600e3);
  db.prepare(`INSERT INTO sessions (id, user_id, csrf_token, created_at, last_seen_at, expires_at, ip, user_agent)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sha256(token), userId, csrf, iso(t), iso(t), iso(expires), ip || null, String(userAgent || '').slice(0, 300));
  return { token, csrf, expires };
}

function sessionCookie(token, expires) {
  return serializeCookie(COOKIE, token, {
    httpOnly: true, secure: config.cookieSecure, sameSite: 'Strict', path: '/',
    maxAge: (expires.getTime() - Date.now()) / 1000,
  });
}

function clearSessionCookie() {
  return serializeCookie(COOKIE, '', { httpOnly: true, secure: config.cookieSecure, sameSite: 'Strict', path: '/', maxAge: 0 });
}

function destroySession(db, sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

function destroyUserSessions(db, userId, exceptSessionId = null) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?').run(userId, exceptSessionId);
}

function pruneSessions(db) {
  const idleCutoff = iso(new Date(Date.now() - config.session.idleMinutes * 60e3));
  db.prepare('DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?').run(iso(now()), idleCutoff);
}

// ---------- middleware ----------

// Loads the session (if any) into ctx.session / ctx.user. Never throws for a
// missing or expired session; ctx.sessionExpired tells the client why it's out.
function authenticate(db) {
  return async (req, res, ctx) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return;
    const row = db.prepare(`SELECT s.id AS sid, s.csrf_token, s.expires_at, s.last_seen_at,
                                   u.id, u.email, u.name, u.role, u.status, u.must_change_password
                            FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`).get(sha256(token));
    if (!row) { ctx.sessionExpired = true; return; }
    const t = now();
    const idleCutoff = new Date(t.getTime() - config.session.idleMinutes * 60e3);
    if (new Date(row.expires_at) < t || new Date(row.last_seen_at) < idleCutoff || row.status !== 'active') {
      destroySession(db, row.sid);
      ctx.sessionExpired = true;
      ctx.setCookies.push(clearSessionCookie());
      return;
    }
    // sliding idle timeout (write at most once a minute)
    if (t - new Date(row.last_seen_at) > 60e3) db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(iso(t), row.sid);
    ctx.session = { id: row.sid, csrf: row.csrf_token };
    ctx.user = { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status, mustChangePassword: !!row.must_change_password };
  };
}

function requireAuth() {
  return async (req, res, ctx) => {
    if (!ctx.user) throw new HttpError(401, ctx.sessionExpired ? 'Your session has expired. Please sign in again.' : 'Please sign in.');
  };
}

function requirePermission(permission) {
  return async (req, res, ctx) => {
    if (!ctx.user) throw new HttpError(401, ctx.sessionExpired ? 'Your session has expired. Please sign in again.' : 'Please sign in.');
    if (!can(ctx.user, permission)) throw new HttpError(403, 'You don’t have permission to do that.');
  };
}

// Same-origin check: browsers send Origin on cross-site POSTs; reject foreign ones.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients / same-origin GET navigations
  const allowed = config.publicOrigin || `${config.cookieSecure ? 'https' : 'http'}://${req.headers.host}`;
  return origin === allowed || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}

function requireSameOrigin() {
  return async (req) => {
    if (!sameOrigin(req)) throw new HttpError(403, 'Request blocked: it didn’t come from this website.');
  };
}

// CSRF token check for state-changing requests made with a session
function requireCsrf() {
  return async (req, res, ctx) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    if (!sameOrigin(req)) throw new HttpError(403, 'Request blocked: it didn’t come from this website.');
    const sent = String(req.headers['x-csrf-token'] || '');
    const expected = ctx.session && ctx.session.csrf;
    if (!expected || sent.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) {
      throw new HttpError(403, 'Security check failed. Reload the page and try again.');
    }
  };
}

module.exports = {
  ROLES, PERMISSIONS, can,
  hashPassword, verifyPassword, burnTime, passwordProblem,
  createSession, sessionCookie, clearSessionCookie, destroySession, destroyUserSessions, pruneSessions,
  authenticate, requireAuth, requirePermission, requireCsrf, requireSameOrigin,
};
