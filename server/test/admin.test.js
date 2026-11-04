// Integration tests: real server, temporary database.   npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nadwi-test-'));
process.env.DATABASE_FILE = path.join(tmp, 'test.db');

const { open, migrate } = require('../db');
const { createApp } = require('../index');
const auth = require('../lib/auth');

let server, base, db;
const ADMIN = { email: 'admin@example.org', password: 'Admin-pass-2026', name: 'Site Admin' };
const USER = { email: 'reader@example.org', password: 'Reader-pass-2026', name: 'Reader' };
const EDITOR = { email: 'editor@example.org', password: 'Editor-pass-2026', name: 'Content Editor' };

// tiny client with its own cookie jar and CSRF token
function client() {
  let cookie = '';
  let csrf = '';
  async function call(method, url, body, { headers = {}, noCsrf = false } = {}) {
    const h = { ...headers };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (csrf && !noCsrf && method !== 'GET') h['X-CSRF-Token'] = csrf;
    const res = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const set = res.headers.getSetCookie();
    for (const c of set) {
      const [pair] = c.split(';');
      cookie = /=$/.test(pair) || /Max-Age=0/.test(c) ? '' : pair;
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* html */ }
    if (json && json.csrfToken) csrf = json.csrfToken;
    return { status: res.status, json, text, headers: res.headers, setCookie: set };
  }
  return {
    call,
    get: (u, o) => call('GET', u, undefined, o),
    post: (u, b, o) => call('POST', u, b ?? {}, o),
    patch: (u, b, o) => call('PATCH', u, b, o),
    put: (u, b, o) => call('PUT', u, b, o),
    del: (u, b, o) => call('DELETE', u, b ?? {}, o),
    login: (who) => call('POST', '/api/auth/login', { email: who.email, password: who.password }),
    get cookie() { return cookie; },
  };
}

before(async () => {
  db = open(process.env.DATABASE_FILE);
  migrate(db);
  for (const [u, role] of [[ADMIN, 'admin'], [USER, 'user'], [EDITOR, 'editor']]) {
    db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)').run(u.email, u.name, await auth.hashPassword(u.password), role);
  }
  server = http.createServer(createApp(db));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const noSecrets = (text) => {
  assert.ok(!/password_hash|scrypt\$|csrf_token/.test(text), 'response leaks a secret field');
};

test('public homepage data comes from the database (seeded content)', async () => {
  const r = await client().get('/api/public/home');
  assert.equal(r.status, 200);
  assert.equal(r.json.reels.length, 12);
  assert.equal(r.json.videos.length, 8);
  assert.equal(r.json.magazines.length, 2);
  assert.equal(r.json.settings.contact_email, 'askus@abulhasanalinadwi.org');
});

test('unauthenticated requests to admin APIs get 401', async () => {
  const c = client();
  for (const url of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/settings', '/api/admin/audit', '/api/auth/me']) {
    const r = await c.get(url);
    assert.equal(r.status, 401, url);
  }
  const r = await c.patch('/api/admin/users/1', { role: 'user' });
  assert.equal(r.status, 401);
});

test('wrong password and unknown email give the same message', async () => {
  const a = await client().call('POST', '/api/auth/login', { email: ADMIN.email, password: 'wrong-password-1' });
  const b = await client().call('POST', '/api/auth/login', { email: 'nobody@example.org', password: 'wrong-password-1' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.json.error, b.json.error);
});

test('normal user can sign in but gets 403 from every admin API', async () => {
  const c = client();
  const r = await c.login(USER);
  assert.equal(r.status, 200);
  assert.equal(r.json.user.role, 'user');
  assert.match(r.setCookie[0], /HttpOnly/);
  assert.match(r.setCookie[0], /SameSite=Strict/);
  noSecrets(r.text);
  assert.equal((await c.get('/api/auth/me')).status, 200);
  for (const url of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/videos', '/api/admin/questions', '/api/admin/settings', '/api/admin/audit']) {
    assert.equal((await c.get(url)).status, 403, url);
  }
  // can't promote itself by calling the API directly
  const me = (await c.get('/api/auth/me')).json.user;
  assert.equal((await c.patch(`/api/admin/users/${me.id}`, { role: 'admin' })).status, 403);
  assert.equal(db.prepare('SELECT role FROM users WHERE id = ?').get(me.id).role, 'user');
});

test('admin can sign in and use the dashboard; nothing secret is returned', async () => {
  const c = client();
  const r = await c.login(ADMIN);
  assert.equal(r.status, 200);
  assert.ok(r.json.user.permissions.includes('users.manage'));
  const d = await c.get('/api/admin/dashboard');
  assert.equal(d.status, 200);
  assert.equal(d.json.users.total, 3);
  assert.equal(d.json.content.reels.total, 12);
  noSecrets(d.text);
  const u = await c.get('/api/admin/users');
  assert.equal(u.status, 200);
  assert.equal(u.json.total, 3);
  noSecrets(u.text);
});

test('state-changing admin calls need the CSRF token and a same-site origin', async () => {
  const c = client();
  await c.login(ADMIN);
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(USER.email);
  assert.equal((await c.patch(`/api/admin/users/${user.id}`, { name: 'X' }, { noCsrf: true })).status, 403);
  assert.equal((await c.patch(`/api/admin/users/${user.id}`, { name: 'Reader' }, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await c.patch(`/api/admin/users/${user.id}`, { name: 'Reader Two' })).status, 200);
  const cross = await client().call('POST', '/api/auth/login', { email: ADMIN.email, password: ADMIN.password }, { headers: { Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
});

test('user management: search, create, role change, safeguards, delete', async () => {
  const c = client();
  await c.login(ADMIN);
  const s = await c.get('/api/admin/users?q=reader');
  assert.equal(s.json.total, 1);

  const weak = await c.post('/api/admin/users', { email: 'new@example.org', name: 'New Person', role: 'user', password: 'short' });
  assert.equal(weak.status, 400);
  assert.equal(weak.json.details.field, 'password');
  const created = await c.post('/api/admin/users', { email: 'new@example.org', name: 'New Person', role: 'user', password: 'Temp-pass-1234' });
  assert.equal(created.status, 201);
  assert.equal(created.json.user.mustChangePassword, true);
  assert.equal((await c.post('/api/admin/users', { email: 'NEW@example.org', name: 'Dup', role: 'user', password: 'Temp-pass-1234' })).status, 409);

  const id = created.json.user.id;
  const promoted = await c.patch(`/api/admin/users/${id}`, { role: 'editor' });
  assert.equal(promoted.json.user.role, 'editor');

  const me = (await c.get('/api/auth/me')).json.user;
  assert.equal((await c.patch(`/api/admin/users/${me.id}`, { role: 'user' })).status, 403, 'cannot demote self');
  assert.equal((await c.del(`/api/admin/users/${me.id}`, { confirmEmail: me.email })).status, 403, 'cannot delete self');

  assert.equal((await c.del(`/api/admin/users/${id}`, { confirmEmail: 'wrong@example.org' })).status, 400);
  assert.equal((await c.del(`/api/admin/users/${id}`, { confirmEmail: 'new@example.org' })).status, 200);
  assert.equal((await c.get(`/api/admin/users/${id}`)).status, 404);
});

test('the last active admin cannot be demoted or disabled', async () => {
  const c = client();
  await c.login(ADMIN);
  // make a second admin, have it try to demote the first, then remove the second
  const second = await c.post('/api/admin/users', { email: 'second@example.org', name: 'Second Admin', role: 'admin', password: 'Strong-words-123' });
  const c2 = client();
  await c2.login({ email: 'second@example.org', password: 'Strong-words-123' });
  const first = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN.email);
  assert.equal((await c2.patch(`/api/admin/users/${first.id}`, { role: 'editor' })).status, 200, 'allowed while another admin exists');
  assert.equal((await c2.patch(`/api/admin/users/${first.id}`, { role: 'admin' })).status, 200);
  // a role change signs that person out, so the first admin must sign in again
  assert.equal((await c.get('/api/admin/dashboard')).status, 401, 'role change ends the session');
  await c.login(ADMIN);
  // disable the second admin -> the first is the only active admin left
  assert.equal((await c.patch(`/api/admin/users/${second.json.user.id}`, { status: 'disabled' })).status, 200);
  assert.equal((await c2.get('/api/auth/me')).status, 401, 'disabled admin is signed out immediately');
  assert.equal((await c.patch(`/api/admin/users/${first.id}`, { status: 'disabled' })).status, 403, 'cannot disable self');
  db.prepare(`UPDATE users SET status = 'active' WHERE id = ?`).run(second.json.user.id);
  const c3 = client();
  await c3.login({ email: 'second@example.org', password: 'Strong-words-123' });
  await c.patch(`/api/admin/users/${second.json.user.id}`, { role: 'editor' });
  assert.equal((await c3.call('POST', '/api/auth/login', { email: 'second@example.org', password: 'Strong-words-123' })).status, 200);
  const c4 = client();
  await c4.login({ email: 'second@example.org', password: 'Strong-words-123' });
  assert.equal((await c4.patch(`/api/admin/users/${first.id}`, { role: 'editor' })).status, 403, 'editors cannot change roles');
  // only one active admin now: nobody can demote or disable them
  const lone = db.prepare(`SELECT count(*) n FROM users WHERE role = 'admin' AND status = 'active'`).get().n;
  assert.equal(lone, 1);
  db.prepare('DELETE FROM users WHERE id = ?').run(second.json.user.id);
});

test('disabled accounts cannot sign in and lose their sessions', async () => {
  const admin = client();
  await admin.login(ADMIN);
  const reader = client();
  await reader.login(USER);
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(USER.email);
  await admin.patch(`/api/admin/users/${u.id}`, { status: 'disabled' });
  assert.equal((await reader.get('/api/auth/me')).status, 401);
  assert.equal((await client().login(USER)).status, 403);
  await admin.patch(`/api/admin/users/${u.id}`, { status: 'active' });
  assert.equal((await client().login(USER)).status, 200);
});

test('editors manage content and questions but not users, settings or the audit log', async () => {
  const c = client();
  await c.login(EDITOR);
  assert.equal((await c.get('/api/admin/dashboard')).status, 200);
  assert.equal((await c.get('/api/admin/dashboard')).json.users, undefined);
  assert.equal((await c.get('/api/admin/videos?kind=reel')).status, 200);
  assert.equal((await c.get('/api/admin/questions')).status, 200);
  assert.equal((await c.get('/api/admin/users')).status, 403);
  assert.equal((await c.get('/api/admin/settings')).status, 403);
  assert.equal((await c.get('/api/admin/audit')).status, 403);
  assert.equal((await c.put('/api/admin/settings', { contact_email: 'x@example.org' })).status, 403);
});

test('video changes are reflected on the public homepage', async () => {
  const c = client();
  await c.login(ADMIN);
  const add = await c.post('/api/admin/videos', { kind: 'reel', youtube: 'https://youtu.be/dQw4w9WgXcQ', title: 'Test reel', series: 'Test', pagePath: '/book/' });
  assert.equal(add.status, 201);
  assert.equal(add.json.item.youtubeId, 'dQw4w9WgXcQ');
  assert.equal((await c.post('/api/admin/videos', { kind: 'reel', youtube: 'dQw4w9WgXcQ', title: 'Dup' })).status, 409);
  assert.equal((await c.post('/api/admin/videos', { kind: 'reel', youtube: 'not a link', title: 'Bad' })).status, 400);
  let home = (await client().get('/api/public/home')).json;
  assert.equal(home.reels.at(-1).title, 'Test reel');
  await c.patch(`/api/admin/videos/${add.json.item.id}`, { isPublished: false });
  home = (await client().get('/api/public/home')).json;
  assert.ok(!home.reels.some((r) => r.youtubeId === 'dQw4w9WgXcQ'), 'unpublished reel is hidden');
  assert.equal((await c.del(`/api/admin/videos/${add.json.item.id}`)).status, 200);
});

test('Ask us questions arrive in the admin inbox', async () => {
  const visitor = client();
  const bad = await visitor.post('/api/public/questions', { question: 'short', name: 'A', email: 'not-an-email' });
  assert.equal(bad.status, 400);
  const ok = await visitor.post('/api/public/questions', { subject: 'Namaz', question: 'What is the time for Asr prayer?', name: 'Visitor', email: 'visitor@example.org', gender: 'Male' });
  assert.equal(ok.status, 201);
  const bot = await visitor.post('/api/public/questions', { question: 'Buy cheap things here now', name: 'Bot', email: 'bot@example.org', website: 'http://spam' });
  assert.equal(bot.status, 201);
  const c = client();
  await c.login(ADMIN);
  const list = await c.get('/api/admin/questions?status=new');
  assert.equal(list.json.total, 1, 'honeypot submission was not stored');
  const qid = list.json.items[0].id;
  assert.equal((await c.patch(`/api/admin/questions/${qid}`, { status: 'answered', adminNote: 'Replied by email' })).json.item.status, 'answered');
});

test('settings validate input and change the public settings', async () => {
  const c = client();
  await c.login(ADMIN);
  const s = (await c.get('/api/admin/settings')).json.settings;
  const bad = await c.put('/api/admin/settings', { ...s, questions_open: true, registration_open: true, contact_email: 'nope' });
  assert.equal(bad.status, 400);
  const good = await c.put('/api/admin/settings', { ...s, questions_open: true, registration_open: true, contact_phone: '+91 98072 40512' });
  assert.equal(good.status, 200);
  assert.equal((await client().get('/api/public/home')).json.settings.contact_phone, '+91 98072 40512');
});

test('visitors can sign up; new accounts are always plain users', async () => {
  const v = client();
  const anon = await v.get('/api/auth/session');
  assert.equal(anon.status, 200);
  assert.equal(anon.json.user, null);
  assert.equal(anon.json.registrationOpen, true);

  const weak = await v.post('/api/auth/register', { name: 'Amina', email: 'amina@example.org', password: 'short' });
  assert.equal(weak.status, 400);
  const r = await v.post('/api/auth/register', { name: 'Amina Siddiqui', email: 'Amina@Example.org', password: 'Reading-daily-77', role: 'admin' });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.role, 'user', 'role sent by the client is ignored');
  assert.equal(r.json.user.email, 'amina@example.org');
  noSecrets(r.text);
  const me = await v.get('/api/auth/session');
  assert.equal(me.json.user.name, 'Amina Siddiqui', 'signed in right after sign-up');
  assert.ok(me.json.csrfToken);
  assert.equal((await v.get('/api/admin/dashboard')).status, 403, 'a new user has no admin access');
  assert.equal((await client().post('/api/auth/register', { name: 'Again', email: 'amina@example.org', password: 'Reading-daily-78' })).status, 409);
  const bot = await client().post('/api/auth/register', { name: 'Bot', email: 'bot2@example.org', password: 'Reading-daily-79', website: 'spam' });
  assert.equal(bot.status, 201);
  assert.equal(db.prepare('SELECT count(*) n FROM users WHERE email = ?').get('bot2@example.org').n, 0, 'honeypot sign-up not stored');
  assert.equal((await v.post('/api/auth/logout')).status, 200);
  assert.equal((await client().login({ email: 'amina@example.org', password: 'Reading-daily-77' })).status, 200);
  const cross = await client().call('POST', '/api/auth/register', { name: 'X Y', email: 'x@example.org', password: 'Reading-daily-80' }, { headers: { Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
});

test('admins can close sign-ups', async () => {
  const c = client();
  await c.login(ADMIN);
  const s = (await c.get('/api/admin/settings')).json.settings;
  await c.put('/api/admin/settings', { ...s, questions_open: true, registration_open: false });
  assert.equal((await client().get('/api/auth/session')).json.registrationOpen, false);
  assert.equal((await client().post('/api/auth/register', { name: 'Late Comer', email: 'late@example.org', password: 'Reading-daily-81' })).status, 403);
  await c.put('/api/admin/settings', { ...s, questions_open: true, registration_open: true });
});

test('logout ends the session', async () => {
  const c = client();
  await c.login(ADMIN);
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/admin/dashboard')).status, 401);
});

test('expired and forged sessions are rejected', async () => {
  const c = client();
  await c.login(ADMIN);
  db.prepare(`UPDATE sessions SET last_seen_at = '2000-01-01T00:00:00.000Z'`).run();
  const r = await c.get('/api/admin/dashboard');
  assert.equal(r.status, 401);
  assert.match(r.json.error, /expired/i);
  const forged = await fetch(base + '/api/admin/dashboard', { headers: { Cookie: 'nc_session=forged-token-value' } });
  assert.equal(forged.status, 401);
});

test('own password change requires the current password', async () => {
  const c = client();
  await c.login(EDITOR);
  assert.equal((await c.post('/api/auth/password', { currentPassword: 'wrong', newPassword: 'Fresh-words-2027' })).status, 400);
  assert.equal((await c.post('/api/auth/password', { currentPassword: EDITOR.password, newPassword: 'Fresh-words-2027' })).status, 200);
  assert.equal((await client().login({ ...EDITOR, password: 'Fresh-words-2027' })).status, 200);
});

test('audit log records admin actions without secrets', async () => {
  const c = client();
  await c.login(ADMIN);
  const log = await c.get('/api/admin/audit?pageSize=100');
  const actions = new Set(log.json.items.map((a) => a.action));
  for (const a of ['auth.login', 'auth.logout', 'user.created', 'user.role_changed', 'user.disabled', 'user.deleted', 'video.created', 'settings.updated', 'auth.login_failed']) {
    assert.ok(actions.has(a), `missing ${a}`);
  }
  noSecrets(log.text);
  assert.ok(!log.text.includes(ADMIN.password) && !log.text.includes('Temp-pass-1234'));
});

test('repeated failed sign-ins are rate limited', async () => {
  const c = client();
  let last;
  for (let i = 0; i < 6; i++) last = await c.call('POST', '/api/auth/login', { email: USER.email, password: 'wrong-password-' + i });
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});

test('static site still works and private folders are not served', async () => {
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Abul Hasan Ali Nadwi/);
  for (const p of ['/server/index.js', '/server/data/test.db', '/tools/build.js', '/README.md', '/server/.env.example', '/%2e%2e/%2e%2e/etc/passwd']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
  const adminPage = await fetch(base + '/admin/users/5');
  assert.equal(adminPage.status, 200);
  assert.match(adminPage.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(adminPage.headers.get('x-frame-options'), 'DENY');
});
