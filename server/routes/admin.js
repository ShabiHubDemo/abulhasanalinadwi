// /api/admin/* — every route states the permission it needs (see lib/auth.js);
// state-changing routes also require the CSRF token. Authorization happens
// here on the server; the admin UI hiding things is only for convenience.

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { HttpError, sendJson } = require('../lib/http');
const v = require('../lib/validate');
const auth = require('../lib/auth');
const audit = require('../lib/audit');
const { tx } = require('../db');

const guard = (permission) => [auth.requirePermission(permission), auth.requireCsrf()];

// ---------- serializers (never include password hashes or session data) ----------
const userOut = (u) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, status: u.status,
  mustChangePassword: !!u.must_change_password, createdAt: u.created_at, updatedAt: u.updated_at, lastLoginAt: u.last_login_at,
});
const videoOut = (r) => ({
  id: r.id, kind: r.kind, youtubeId: r.youtube_id, title: r.title, series: r.series, pagePath: r.page_path,
  durationSeconds: r.duration_seconds, uploadedOn: r.uploaded_on, sortOrder: r.sort_order,
  isPublished: !!r.is_published, createdAt: r.created_at, updatedAt: r.updated_at,
});
const magazineOut = (m) => ({
  id: m.id, slug: m.slug, name: m.name, nativeName: m.native_name, language: m.language, langCode: m.lang_code,
  textDir: m.text_dir, issueLabel: m.issue_label, coverUrl: m.cover_url, pdfUrl: m.pdf_url,
  archivePath: m.archive_path, sinceYear: m.since_year, sortOrder: m.sort_order, isPublished: !!m.is_published, updatedAt: m.updated_at,
});
const questionOut = (q) => ({
  id: q.id, subject: q.subject, question: q.question, name: q.name, email: q.email, address: q.address,
  gender: q.gender, status: q.status, adminNote: q.admin_note, createdAt: q.created_at, updatedAt: q.updated_at,
});
const auditOut = (a) => ({
  id: a.id, actorId: a.actor_id, actorEmail: a.actor_email, action: a.action, targetType: a.target_type,
  targetId: a.target_id, meta: a.meta ? JSON.parse(a.meta) : null, ip: a.ip, createdAt: a.created_at,
});

const SETTINGS = {
  contact_email: { label: 'Contact email', read: (b) => v.email(b, 'contact_email', { label: 'Contact email' }) },
  contact_phone: { label: 'Contact phone', read: (b) => {
    const s = v.text(b, 'contact_phone', { label: 'Contact phone', max: 40 });
    if (s && !/^[0-9+\-()\s]{6,40}$/.test(s)) v.fail('contact_phone', 'Contact phone may only contain digits, spaces, + - ( ).');
    return s;
  } },
  contact_address: { label: 'Address', read: (b) => v.text(b, 'contact_address', { label: 'Address', required: true, max: 300 }) },
  youtube_url: { label: 'YouTube channel', read: (b) => v.httpUrl(b, 'youtube_url', { label: 'YouTube channel', required: true }) },
  questions_open: { label: 'Accept questions', read: (b) => {
    const x = v.bool(b, 'questions_open', { label: 'Accept questions', required: true });
    return x ? 'true' : 'false';
  } },
  registration_open: { label: 'Allow sign-ups', read: (b) => {
    const x = v.bool(b, 'registration_open', { label: 'Allow sign-ups', required: true });
    return x ? 'true' : 'false';
  } },
};

function readSettings(db) {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

// counts of the mirrored website, from the files the build writes
let siteStatsCache = null;
function siteStats() {
  if (siteStatsCache) return siteStatsCache;
  const stats = { pages: null, books: null };
  try {
    const src = fs.readFileSync(path.join(config.siteRoot, 'assets', 'site-map.js'), 'utf8');
    const pages = JSON.parse(src.match(/window\.SITE_PAGES=(\[.*?\]);/)[1]);
    stats.pages = pages.length;
    stats.books = pages.filter((p) => /^\/book\/[^/]+\/$/.test(p)).length;
  } catch (e) { /* site not built yet */ }
  siteStatsCache = stats;
  return stats;
}

function getUser(db, id) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new HttpError(404, 'User not found.');
  return u;
}

function activeAdminCount(db) {
  return db.prepare(`SELECT count(*) n FROM users WHERE role = 'admin' AND status = 'active'`).get().n;
}

function register(router, { db }) {
  // ---------- dashboard ----------
  router.route('GET', '/api/admin/dashboard', auth.requirePermission('dashboard.view'), async (req, res, ctx) => {
    const one = (sql, ...a) => db.prepare(sql).get(...a);
    const since = (days) => new Date(Date.now() - days * 864e5).toISOString();
    const users = {
      total: one('SELECT count(*) n FROM users').n,
      active: one(`SELECT count(*) n FROM users WHERE status = 'active'`).n,
      disabled: one(`SELECT count(*) n FROM users WHERE status = 'disabled'`).n,
      newLast30Days: one('SELECT count(*) n FROM users WHERE created_at >= ?', since(30)).n,
      signedInLast7Days: one('SELECT count(*) n FROM users WHERE last_login_at >= ?', since(7)).n,
      byRole: Object.fromEntries(db.prepare('SELECT role, count(*) n FROM users GROUP BY role').all().map((r) => [r.role, r.n])),
    };
    const questions = {
      total: one('SELECT count(*) n FROM questions').n,
      new: one(`SELECT count(*) n FROM questions WHERE status = 'new'`).n,
      last7Days: one('SELECT count(*) n FROM questions WHERE created_at >= ?', since(7)).n,
    };
    const content = {
      reels: one(`SELECT count(*) n, sum(is_published) p FROM videos WHERE kind = 'reel'`),
      videos: one(`SELECT count(*) n, sum(is_published) p FROM videos WHERE kind = 'video'`),
      magazines: one('SELECT count(*) n, sum(is_published) p FROM magazines'),
    };
    const body = {
      users, questions,
      content: {
        reels: { total: content.reels.n, published: content.reels.p || 0 },
        videos: { total: content.videos.n, published: content.videos.p || 0 },
        magazines: { total: content.magazines.n, published: content.magazines.p || 0 },
      },
      site: siteStats(),
      recentQuestions: db.prepare('SELECT * FROM questions ORDER BY created_at DESC LIMIT 5').all().map(questionOut),
      // the full log is admin-only; editors see their own recent actions
      recentActivity: (auth.can(ctx.user, 'audit.view')
        ? db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 8').all()
        : db.prepare('SELECT * FROM audit_log WHERE actor_id = ? ORDER BY id DESC LIMIT 8').all(ctx.user.id)).map(auditOut),
    };
    if (!auth.can(ctx.user, 'users.manage')) delete body.users;
    sendJson(res, 200, body);
  });

  // ---------- users ----------
  router.route('GET', '/api/admin/users', auth.requirePermission('users.manage'), async (req, res, ctx) => {
    const q = ctx.query;
    const where = [], args = [];
    const search = (q.get('q') || '').trim().slice(0, 100);
    if (search) {
      if (/^\d+$/.test(search)) { where.push('(id = ? OR email LIKE ? OR name LIKE ?)'); args.push(Number(search), `%${search}%`, `%${search}%`); }
      else { where.push('(email LIKE ? OR name LIKE ?)'); args.push(`%${search}%`, `%${search}%`); }
    }
    if (auth.ROLES.includes(q.get('role'))) { where.push('role = ?'); args.push(q.get('role')); }
    if (['active', 'disabled'].includes(q.get('status'))) { where.push('status = ?'); args.push(q.get('status')); }
    const sorts = { newest: 'created_at DESC', oldest: 'created_at ASC', name: 'name COLLATE NOCASE ASC', lastLogin: 'last_login_at DESC' };
    const order = sorts[q.get('sort')] || sorts.newest;
    const { page, size, offset } = v.pageParams(q);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = db.prepare(`SELECT count(*) n FROM users ${w}`).get(...args).n;
    const rows = db.prepare(`SELECT * FROM users ${w} ORDER BY ${order}, id DESC LIMIT ? OFFSET ?`).all(...args, size, offset);
    sendJson(res, 200, { items: rows.map(userOut), total, page, pageSize: size });
  });

  router.route('POST', '/api/admin/users', ...guard('users.manage'), async (req, res, ctx) => {
    const b = ctx.body;
    const email = v.email(b, 'email');
    const name = v.text(b, 'name', { label: 'Name', required: true, max: 100 });
    const role = v.oneOf(b, 'role', auth.ROLES, { label: 'Role' });
    const password = typeof b.password === 'string' ? b.password : '';
    const problem = auth.passwordProblem(password, { email, name });
    if (problem) throw new HttpError(400, problem, { field: 'password' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with this email already exists.', { field: 'email' });
    const hash = await auth.hashPassword(password);
    // the person must choose their own password at first sign-in
    const info = db.prepare(`INSERT INTO users (email, name, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)`).run(email, name, hash, role);
    audit.record(db, ctx, 'user.created', { targetType: 'user', targetId: info.lastInsertRowid, meta: { email, role } });
    sendJson(res, 201, { user: userOut(getUser(db, info.lastInsertRowid)) });
  });

  router.route('GET', '/api/admin/users/:id', auth.requirePermission('users.manage'), async (req, res, ctx) => {
    const u = getUser(db, v.idParam(ctx.params.id));
    const activity = db.prepare(`SELECT * FROM audit_log WHERE actor_id = ? OR (target_type = 'user' AND target_id = ?)
                                 ORDER BY id DESC LIMIT 25`).all(u.id, String(u.id)).map(auditOut);
    const sessions = db.prepare('SELECT count(*) n FROM sessions WHERE user_id = ? AND expires_at > ?').get(u.id, new Date().toISOString()).n;
    sendJson(res, 200, { user: userOut(u), activity, activeSessions: sessions, isSelf: u.id === ctx.user.id });
  });

  router.route('PATCH', '/api/admin/users/:id', ...guard('users.manage'), async (req, res, ctx) => {
    const id = v.idParam(ctx.params.id);
    const b = ctx.body;
    const result = tx(db, () => {
      const u = getUser(db, id);
      const changes = {};
      if (b.name !== undefined) changes.name = v.text(b, 'name', { label: 'Name', required: true, max: 100 });
      if (b.role !== undefined) changes.role = v.oneOf(b, 'role', auth.ROLES, { label: 'Role' });
      if (b.status !== undefined) changes.status = v.oneOf(b, 'status', ['active', 'disabled'], { label: 'Status' });
      const self = u.id === ctx.user.id;
      if (self && ((changes.role && changes.role !== u.role) || (changes.status && changes.status !== u.status))) {
        throw new HttpError(403, 'You can’t change your own role or status. Ask another administrator.');
      }
      const losesAdmin = u.role === 'admin' && u.status === 'active' &&
        ((changes.role && changes.role !== 'admin') || changes.status === 'disabled');
      if (losesAdmin && activeAdminCount(db) <= 1) throw new HttpError(409, 'This is the last active administrator. Make someone else an administrator first.');
      const keys = Object.keys(changes).filter((k) => changes[k] !== u[k]);
      if (!keys.length) return { u, keys };
      db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
        .run(...keys.map((k) => changes[k]), id);
      if (changes.status === 'disabled' || keys.includes('role')) auth.destroyUserSessions(db, id); // takes effect immediately
      const meta = Object.fromEntries(keys.map((k) => [k, { from: u[k], to: changes[k] }]));
      const action = keys.includes('role') ? 'user.role_changed' : keys.includes('status') ? (changes.status === 'disabled' ? 'user.disabled' : 'user.enabled') : 'user.updated';
      audit.record(db, ctx, action, { targetType: 'user', targetId: id, meta: { email: u.email, ...meta } });
      return { u: getUser(db, id), keys };
    });
    sendJson(res, 200, { user: userOut(result.u), changed: result.keys });
  });

  router.route('POST', '/api/admin/users/:id/password', ...guard('users.manage'), async (req, res, ctx) => {
    const u = getUser(db, v.idParam(ctx.params.id));
    if (u.id === ctx.user.id) throw new HttpError(400, 'Change your own password under Settings → My account.');
    const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    const problem = auth.passwordProblem(password, u);
    if (problem) throw new HttpError(400, problem, { field: 'password' });
    const hash = await auth.hashPassword(password);
    db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(hash, u.id);
    auth.destroyUserSessions(db, u.id);
    audit.record(db, ctx, 'user.password_reset', { targetType: 'user', targetId: u.id, meta: { email: u.email } });
    sendJson(res, 200, { ok: true });
  });

  router.route('DELETE', '/api/admin/users/:id', ...guard('users.manage'), async (req, res, ctx) => {
    const id = v.idParam(ctx.params.id);
    tx(db, () => {
      const u = getUser(db, id);
      if (u.id === ctx.user.id) throw new HttpError(403, 'You can’t delete your own account.');
      if (String(ctx.body.confirmEmail || '').toLowerCase() !== u.email.toLowerCase()) {
        throw new HttpError(400, 'Type the account’s email address to confirm deletion.', { field: 'confirmEmail' });
      }
      if (u.role === 'admin' && u.status === 'active' && activeAdminCount(db) <= 1) throw new HttpError(409, 'You can’t delete the last active administrator.');
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      audit.record(db, ctx, 'user.deleted', { targetType: 'user', targetId: id, meta: { email: u.email, role: u.role } });
    });
    sendJson(res, 200, { ok: true });
  });

  // ---------- videos (Shorts & Reels, Videos) ----------
  const getVideo = (id) => {
    const r = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
    if (!r) throw new HttpError(404, 'Video not found.');
    return r;
  };
  const readVideo = (b, partial) => {
    const out = {};
    if (!partial || b.youtube !== undefined) out.youtube_id = v.youtubeId(b, 'youtube');
    if (!partial || b.title !== undefined) out.title = v.text(b, 'title', { label: 'Title', required: true, max: 150 });
    if (!partial || b.series !== undefined) out.series = v.text(b, 'series', { label: 'Series / speaker', max: 100 });
    if (!partial || b.pagePath !== undefined) out.page_path = v.sitePath(b, 'pagePath', { label: 'Lesson page' });
    if (!partial || b.durationSeconds !== undefined) out.duration_seconds = v.int(b, 'durationSeconds', { label: 'Length', min: 1, max: 86400 });
    if (!partial || b.uploadedOn !== undefined) out.uploaded_on = v.date(b, 'uploadedOn', { label: 'Upload date' });
    if (b.isPublished !== undefined) out.is_published = v.bool(b, 'isPublished') ? 1 : 0;
    return out;
  };

  router.route('GET', '/api/admin/videos', auth.requirePermission('content.manage'), async (req, res, ctx) => {
    const kind = ['reel', 'video'].includes(ctx.query.get('kind')) ? ctx.query.get('kind') : null;
    const rows = kind
      ? db.prepare('SELECT * FROM videos WHERE kind = ? ORDER BY sort_order, id').all(kind)
      : db.prepare('SELECT * FROM videos ORDER BY kind, sort_order, id').all();
    sendJson(res, 200, { items: rows.map(videoOut) });
  });

  router.route('POST', '/api/admin/videos', ...guard('content.manage'), async (req, res, ctx) => {
    const kind = v.oneOf(ctx.body, 'kind', ['reel', 'video'], { label: 'Section' });
    const d = readVideo(ctx.body, false);
    if (db.prepare('SELECT 1 FROM videos WHERE kind = ? AND youtube_id = ?').get(kind, d.youtube_id)) {
      throw new HttpError(409, `This video is already in ${kind === 'reel' ? 'Shorts & Reels' : 'Videos'}.`, { field: 'youtube' });
    }
    const order = db.prepare('SELECT coalesce(max(sort_order), 0) + 1 n FROM videos WHERE kind = ?').get(kind).n;
    const info = db.prepare(`INSERT INTO videos (kind, youtube_id, title, series, page_path, duration_seconds, uploaded_on, sort_order, is_published)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(kind, d.youtube_id, d.title, d.series, d.page_path, d.duration_seconds, d.uploaded_on, order, d.is_published ?? 1);
    audit.record(db, ctx, 'video.created', { targetType: 'video', targetId: info.lastInsertRowid, meta: { kind, youtubeId: d.youtube_id, title: d.title } });
    sendJson(res, 201, { item: videoOut(getVideo(info.lastInsertRowid)) });
  });

  router.route('PATCH', '/api/admin/videos/:id', ...guard('content.manage'), async (req, res, ctx) => {
    const r = getVideo(v.idParam(ctx.params.id));
    const d = readVideo(ctx.body, true);
    if (d.youtube_id && d.youtube_id !== r.youtube_id &&
        db.prepare('SELECT 1 FROM videos WHERE kind = ? AND youtube_id = ? AND id != ?').get(r.kind, d.youtube_id, r.id)) {
      throw new HttpError(409, 'That video is already in this section.', { field: 'youtube' });
    }
    const keys = Object.keys(d).filter((k) => d[k] !== r[k]);
    if (keys.length) {
      db.prepare(`UPDATE videos SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
        .run(...keys.map((k) => d[k]), r.id);
      const action = keys.length === 1 && keys[0] === 'is_published' ? (d.is_published ? 'video.published' : 'video.unpublished') : 'video.updated';
      audit.record(db, ctx, action, { targetType: 'video', targetId: r.id, meta: { title: d.title || r.title, fields: keys } });
    }
    sendJson(res, 200, { item: videoOut(getVideo(r.id)) });
  });

  router.route('POST', '/api/admin/videos/reorder', ...guard('content.manage'), async (req, res, ctx) => {
    const kind = v.oneOf(ctx.body, 'kind', ['reel', 'video'], { label: 'Section' });
    const ids = ctx.body.ids;
    const existing = db.prepare('SELECT id FROM videos WHERE kind = ?').all(kind).map((r) => r.id);
    if (!Array.isArray(ids) || ids.length !== existing.length || !ids.every((id) => existing.includes(id)) || new Set(ids).size !== ids.length) {
      throw new HttpError(400, 'The order must list every video in the section exactly once.');
    }
    tx(db, () => ids.forEach((id, i) => db.prepare('UPDATE videos SET sort_order = ? WHERE id = ?').run(i + 1, id)));
    audit.record(db, ctx, 'video.reordered', { targetType: 'video', meta: { kind } });
    sendJson(res, 200, { ok: true });
  });

  router.route('DELETE', '/api/admin/videos/:id', ...guard('content.manage'), async (req, res, ctx) => {
    const r = getVideo(v.idParam(ctx.params.id));
    db.prepare('DELETE FROM videos WHERE id = ?').run(r.id);
    audit.record(db, ctx, 'video.deleted', { targetType: 'video', targetId: r.id, meta: { kind: r.kind, youtubeId: r.youtube_id, title: r.title } });
    sendJson(res, 200, { ok: true });
  });

  // look up a YouTube video's title before adding it (server-side, so the
  // admin page doesn't need to talk to YouTube)
  router.route('GET', '/api/admin/youtube', auth.requirePermission('content.manage'), async (req, res, ctx) => {
    const id = v.youtubeId({ youtube: ctx.query.get('url') || '' }, 'youtube');
    let info = null;
    try {
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { signal: AbortSignal.timeout(6000) });
      if (r.ok) { const j = await r.json(); info = { title: j.title, author: j.author_name }; }
      else if (r.status === 404 || r.status === 401 || r.status === 400) throw new HttpError(404, 'YouTube says this video doesn’t exist or isn’t public.', { field: 'youtube' });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      // network trouble: still return the ID so the admin can type a title
    }
    sendJson(res, 200, { youtubeId: id, title: info ? info.title : null, author: info ? info.author : null });
  });

  // ---------- magazines ----------
  router.route('GET', '/api/admin/magazines', auth.requirePermission('content.manage'), async (req, res) => {
    sendJson(res, 200, { items: db.prepare('SELECT * FROM magazines ORDER BY sort_order, id').all().map(magazineOut) });
  });

  router.route('PATCH', '/api/admin/magazines/:id', ...guard('content.manage'), async (req, res, ctx) => {
    const id = v.idParam(ctx.params.id);
    const m = db.prepare('SELECT * FROM magazines WHERE id = ?').get(id);
    if (!m) throw new HttpError(404, 'Magazine not found.');
    const b = ctx.body, d = {};
    if (b.name !== undefined) d.name = v.text(b, 'name', { label: 'Name', required: true, max: 80 });
    if (b.nativeName !== undefined) d.native_name = v.text(b, 'nativeName', { label: 'Name in its own script', max: 80 });
    if (b.issueLabel !== undefined) d.issue_label = v.text(b, 'issueLabel', { label: 'Issue', required: true, max: 40 });
    if (b.coverUrl !== undefined) d.cover_url = v.httpUrl(b, 'coverUrl', { label: 'Cover image', required: true });
    if (b.pdfUrl !== undefined) d.pdf_url = v.httpUrl(b, 'pdfUrl', { label: 'PDF', required: true });
    if (b.archivePath !== undefined) d.archive_path = v.sitePath(b, 'archivePath', { label: 'Archive page' });
    if (b.sinceYear !== undefined) {
      d.since_year = v.text(b, 'sinceYear', { label: 'Published since', max: 4 });
      if (d.since_year && !/^\d{4}$/.test(d.since_year)) v.fail('sinceYear', 'Published since must be a year, like 2009.');
    }
    if (b.isPublished !== undefined) d.is_published = v.bool(b, 'isPublished') ? 1 : 0;
    const keys = Object.keys(d).filter((k) => d[k] !== m[k]);
    if (keys.length) {
      db.prepare(`UPDATE magazines SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(...keys.map((k) => d[k]), id);
      audit.record(db, ctx, 'magazine.updated', { targetType: 'magazine', targetId: id, meta: { name: m.name, fields: keys, issue: d.issue_label } });
    }
    sendJson(res, 200, { item: magazineOut(db.prepare('SELECT * FROM magazines WHERE id = ?').get(id)) });
  });

  // ---------- questions (Ask us inbox) ----------
  const getQuestion = (id) => {
    const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
    if (!q) throw new HttpError(404, 'Question not found.');
    return q;
  };

  router.route('GET', '/api/admin/questions', auth.requirePermission('questions.manage'), async (req, res, ctx) => {
    const q = ctx.query, where = [], args = [];
    if (['new', 'answered', 'archived'].includes(q.get('status'))) { where.push('status = ?'); args.push(q.get('status')); }
    const search = (q.get('q') || '').trim().slice(0, 100);
    if (search) { where.push('(subject LIKE ? OR question LIKE ? OR name LIKE ? OR email LIKE ?)'); args.push(...Array(4).fill(`%${search}%`)); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { page, size, offset } = v.pageParams(q);
    const total = db.prepare(`SELECT count(*) n FROM questions ${w}`).get(...args).n;
    const rows = db.prepare(`SELECT * FROM questions ${w} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...args, size, offset);
    const counts = Object.fromEntries(db.prepare('SELECT status, count(*) n FROM questions GROUP BY status').all().map((r) => [r.status, r.n]));
    sendJson(res, 200, { items: rows.map(questionOut), total, page, pageSize: size, counts });
  });

  router.route('GET', '/api/admin/questions/:id', auth.requirePermission('questions.manage'), async (req, res, ctx) => {
    sendJson(res, 200, { item: questionOut(getQuestion(v.idParam(ctx.params.id))) });
  });

  router.route('PATCH', '/api/admin/questions/:id', ...guard('questions.manage'), async (req, res, ctx) => {
    const qn = getQuestion(v.idParam(ctx.params.id));
    const d = {};
    if (ctx.body.status !== undefined) d.status = v.oneOf(ctx.body, 'status', ['new', 'answered', 'archived'], { label: 'Status' });
    if (ctx.body.adminNote !== undefined) d.admin_note = v.text(ctx.body, 'adminNote', { label: 'Note', max: 2000, multiline: true });
    const keys = Object.keys(d).filter((k) => d[k] !== qn[k]);
    if (keys.length) {
      db.prepare(`UPDATE questions SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(...keys.map((k) => d[k]), qn.id);
      audit.record(db, ctx, d.status ? `question.${d.status}` : 'question.note_updated', { targetType: 'question', targetId: qn.id, meta: { subject: qn.subject } });
    }
    sendJson(res, 200, { item: questionOut(getQuestion(qn.id)) });
  });

  router.route('DELETE', '/api/admin/questions/:id', ...guard('questions.manage'), async (req, res, ctx) => {
    const qn = getQuestion(v.idParam(ctx.params.id));
    db.prepare('DELETE FROM questions WHERE id = ?').run(qn.id);
    audit.record(db, ctx, 'question.deleted', { targetType: 'question', targetId: qn.id, meta: { subject: qn.subject } });
    sendJson(res, 200, { ok: true });
  });

  // ---------- audit log ----------
  router.route('GET', '/api/admin/audit', auth.requirePermission('audit.view'), async (req, res, ctx) => {
    const q = ctx.query, where = [], args = [];
    const action = (q.get('action') || '').trim();
    if (/^[a-z_.]{1,40}$/.test(action)) { where.push('action LIKE ?'); args.push(action.endsWith('.') ? action + '%' : action); }
    const actor = Number(q.get('actor'));
    if (Number.isInteger(actor) && actor > 0) { where.push('actor_id = ?'); args.push(actor); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { page, size, offset } = v.pageParams(q, { defaultSize: 30 });
    const total = db.prepare(`SELECT count(*) n FROM audit_log ${w}`).get(...args).n;
    const rows = db.prepare(`SELECT * FROM audit_log ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, size, offset);
    sendJson(res, 200, { items: rows.map(auditOut), total, page, pageSize: size });
  });

  // ---------- settings ----------
  router.route('GET', '/api/admin/settings', auth.requirePermission('settings.manage'), async (req, res) => {
    sendJson(res, 200, { settings: readSettings(db) });
  });

  router.route('PUT', '/api/admin/settings', ...guard('settings.manage'), async (req, res, ctx) => {
    const current = readSettings(db);
    const next = {};
    for (const [key, def] of Object.entries(SETTINGS)) next[key] = def.read(ctx.body);
    const changed = Object.keys(next).filter((k) => next[k] !== current[k]);
    tx(db, () => {
      for (const k of changed) {
        db.prepare(`INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).run(k, next[k], ctx.user.id);
      }
      if (changed.length) audit.record(db, ctx, 'settings.updated', { meta: { fields: changed } });
    });
    sendJson(res, 200, { settings: readSettings(db), changed });
  });
}

module.exports = { register, readSettings, videoOut, magazineOut };
