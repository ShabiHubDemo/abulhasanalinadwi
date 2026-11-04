// /api/auth/* — sign in, sign out, current user, change own password.
// Shared by every account type; the role decides what the account may do.

const config = require('../config');
const { HttpError, sendJson } = require('../lib/http');
const v = require('../lib/validate');
const auth = require('../lib/auth');
const audit = require('../lib/audit');
const { createLimiter } = require('../lib/ratelimit');

const windowMs = config.loginRateLimit.windowMinutes * 60e3;
const perAccount = createLimiter({ windowMs, max: config.loginRateLimit.maxPerAccount });
const perIp = createLimiter({ windowMs, max: config.loginRateLimit.maxPerIp });
const signups = createLimiter({ windowMs: 60 * 60e3, max: 5 }); // new accounts per IP per hour

const GENERIC_LOGIN_ERROR = 'The email or password is incorrect.';

function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, status: u.status,
    mustChangePassword: !!(u.must_change_password ?? u.mustChangePassword),
    permissions: auth.PERMISSIONS[u.role] || [],
  };
}

function register(router, { db }) {
  router.route('POST', '/api/auth/login', auth.requireSameOrigin(), async (req, res, ctx) => {
    const body = ctx.body;
    const email = v.email(body, 'email');
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) v.fail('password', 'Password is required.');
    if (password.length > 200) throw new HttpError(401, GENERIC_LOGIN_ERROR);

    const accountKey = `${ctx.ip}|${email}`;
    const wait = Math.max(perAccount.retryAfter(accountKey), perIp.retryAfter(ctx.ip));
    if (wait) {
      const err = new HttpError(429, `Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? 's' : ''}.`);
      err.retryAfter = wait;
      throw err;
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = user ? await auth.verifyPassword(password, user.password_hash) : (await auth.burnTime(password), false);
    if (!ok) {
      perAccount.hit(accountKey);
      perIp.hit(ctx.ip);
      if (user) audit.record(db, ctx, 'auth.login_failed', { targetType: 'user', targetId: user.id, actor: null, meta: { email } });
      throw new HttpError(401, GENERIC_LOGIN_ERROR);
    }
    // only reveal a disabled account to someone who knows its password
    if (user.status !== 'active') throw new HttpError(403, 'This account has been disabled. Contact an administrator.');

    perAccount.reset(accountKey);
    auth.pruneSessions(db);
    const s = auth.createSession(db, user.id, { ip: ctx.ip, userAgent: req.headers['user-agent'] });
    db.prepare(`UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(user.id);
    audit.record(db, ctx, 'auth.login', { targetType: 'user', targetId: user.id, actor: user });
    ctx.setCookies.push(auth.sessionCookie(s.token, s.expires));
    sendJson(res, 200, { user: publicUser(user), csrfToken: s.csrf });
  });

  // Public sign-up. Always creates a plain "user" account; any role sent by the
  // client is ignored, so nobody can sign themselves up as staff.
  router.route('POST', '/api/auth/register', auth.requireSameOrigin(), async (req, res, ctx) => {
    const open = db.prepare(`SELECT value FROM settings WHERE key = 'registration_open'`).get();
    if (!open || open.value !== 'true') throw new HttpError(403, 'New accounts can’t be created at the moment.');
    const b = ctx.body;
    if (b.website) return sendJson(res, 201, { ok: true }); // spam trap filled in: pretend success
    const wait = signups.retryAfter(ctx.ip);
    if (wait) {
      const err = new HttpError(429, 'Too many accounts created from here. Please try again later.');
      err.retryAfter = wait;
      throw err;
    }
    const name = v.text(b, 'name', { label: 'Your name', required: true, max: 100, min: 2 });
    const email = v.email(b, 'email');
    const password = typeof b.password === 'string' ? b.password : '';
    const problem = auth.passwordProblem(password, { email, name });
    if (problem) throw new HttpError(400, problem, { field: 'password' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'An account with this email already exists. Sign in instead.', { field: 'email' });
    }
    const hash = await auth.hashPassword(password);
    signups.hit(ctx.ip);
    const info = db.prepare(`INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'user')`).run(email, name, hash);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    audit.record(db, ctx, 'user.registered', { targetType: 'user', targetId: user.id, actor: user, meta: { email } });
    // signed in straight away
    const s = auth.createSession(db, user.id, { ip: ctx.ip, userAgent: req.headers['user-agent'] });
    db.prepare(`UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(user.id);
    ctx.setCookies.push(auth.sessionCookie(s.token, s.expires));
    sendJson(res, 201, { user: publicUser(user), csrfToken: s.csrf });
  });

  // For the public site's header: who is signed in, without a 401 for visitors.
  router.route('GET', '/api/auth/session', async (req, res, ctx) => {
    const open = db.prepare(`SELECT value FROM settings WHERE key = 'registration_open'`).get();
    sendJson(res, 200, {
      user: ctx.user ? publicUser(ctx.user) : null,
      csrfToken: ctx.session ? ctx.session.csrf : null,
      registrationOpen: !!open && open.value === 'true',
    });
  });

  router.route('POST', '/api/auth/logout', auth.requireAuth(), auth.requireCsrf(), async (req, res, ctx) => {
    auth.destroySession(db, ctx.session.id);
    audit.record(db, ctx, 'auth.logout', { targetType: 'user', targetId: ctx.user.id });
    ctx.setCookies.push(auth.clearSessionCookie());
    sendJson(res, 200, { ok: true });
  });

  router.route('GET', '/api/auth/me', auth.requireAuth(), async (req, res, ctx) => {
    sendJson(res, 200, { user: publicUser(ctx.user), csrfToken: ctx.session.csrf });
  });

  router.route('POST', '/api/auth/password', auth.requireAuth(), auth.requireCsrf(), async (req, res, ctx) => {
    const current = typeof ctx.body.currentPassword === 'string' ? ctx.body.currentPassword : '';
    const next = typeof ctx.body.newPassword === 'string' ? ctx.body.newPassword : '';
    const row = db.prepare('SELECT password_hash, email, name FROM users WHERE id = ?').get(ctx.user.id);
    if (!current || !(await auth.verifyPassword(current, row.password_hash))) {
      throw new HttpError(400, 'Your current password is incorrect.', { field: 'currentPassword' });
    }
    const problem = auth.passwordProblem(next, row);
    if (problem) throw new HttpError(400, problem, { field: 'newPassword' });
    if (current === next) throw new HttpError(400, 'Choose a password different from the current one.', { field: 'newPassword' });
    const hash = await auth.hashPassword(next);
    db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(hash, ctx.user.id);
    auth.destroyUserSessions(db, ctx.user.id, ctx.session.id); // sign out everywhere else
    audit.record(db, ctx, 'auth.password_changed', { targetType: 'user', targetId: ctx.user.id });
    sendJson(res, 200, { ok: true });
  });
}

module.exports = { register, publicUser };
