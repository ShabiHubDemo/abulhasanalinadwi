// Web server: serves the existing static website unchanged, the admin panel
// under /admin, and the JSON API under /api.
//
//   npm start            (from the server/ folder)

const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('./config');
const { open, migrate } = require('./db');
const { createRouter, sendJson, sendError, readJsonBody, HttpError } = require('./lib/http');
const auth = require('./lib/auth');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.xml': 'application/xml',
};

// never served: the backend, build tools, dotfiles and docs
const BLOCKED = /(^|\/)(\.[^/]*|server|tools|node_modules|android-app)(\/|$)|\.md$/i;

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

const ADMIN_HEADERS = {
  ...BASE_HEADERS,
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://i.ytimg.com https://abulhasanalinadwi.org",
    "frame-src https://www.youtube-nocookie.com",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
};

function clientIp(req) {
  if (config.trustProxy) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}

function serveFile(req, res, file, status = 200, headers = BASE_HEADERS) {
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  res.writeHead(status, {
    ...headers,
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': headers['Cache-Control'] || (ext === '.html' ? 'no-cache' : 'public, max-age=300'),
    'Last-Modified': stat.mtime.toUTCString(),
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function serveStatic(req, res, urlPath) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...BASE_HEADERS, Allow: 'GET, HEAD' });
    return res.end();
  }
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch (e) { rel = null; }
  const notFound = () => {
    const page = path.join(config.siteRoot, '404.html');
    if (fs.existsSync(page)) return serveFile(req, res, page, 404);
    res.writeHead(404, { ...BASE_HEADERS, 'Content-Type': 'text/plain' });
    res.end('Not found');
  };
  if (!rel || rel.includes('\0') || BLOCKED.test(rel)) return notFound();

  // the admin panel is a single page that handles its own routes
  if (rel === '/admin' || rel.startsWith('/admin/')) {
    return serveFile(req, res, path.join(config.siteRoot, 'admin', 'index.html'), 200, ADMIN_HEADERS);
  }

  const file = path.normalize(path.join(config.siteRoot, rel));
  if (file !== config.siteRoot && !file.startsWith(config.siteRoot + path.sep)) return notFound();
  let target = file;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    if (!urlPath.endsWith('/')) {
      res.writeHead(301, { ...BASE_HEADERS, Location: urlPath + '/' });
      return res.end();
    }
    target = path.join(target, 'index.html');
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return notFound();
  serveFile(req, res, target);
}

function createApp(db) {
  const router = createRouter();
  require('./routes/auth').register(router, { db });
  require('./routes/admin').register(router, { db });
  require('./routes/public').register(router, { db });
  const loadSession = auth.authenticate(db);

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      try {
        return serveStatic(req, res, url.pathname);
      } catch (err) {
        console.error('[static]', err.message);
        if (!res.headersSent) res.writeHead(500, { ...BASE_HEADERS, 'Content-Type': 'text/plain' });
        return res.end('Server error');
      }
    }

    const ctx = { path: url.pathname, query: url.searchParams, ip: clientIp(req), setCookies: [], body: {} };
    // attach any cookies set during the request to whatever response is sent
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
      if (ctx.setCookies.length) res.setHeader('Set-Cookie', ctx.setCookies);
      return writeHead.apply(this, args);
    };
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) ctx.body = await readJsonBody(req);
      await loadSession(req, res, ctx);
      const handled = await router.handle(req, res, ctx);
      if (!handled) throw new HttpError(404, 'Not found.');
      if (!res.headersSent) sendJson(res, 204);
    } catch (err) {
      sendError(res, err);
    }
  };
}

async function bootstrapAdmin(db) {
  const email = String(process.env.ADMIN_EMAIL).trim().toLowerCase();
  const name = String(process.env.ADMIN_NAME || '').trim() || email.split('@')[0];
  const password = process.env.ADMIN_PASSWORD;
  const problem = auth.passwordProblem(password, { email, name });
  if (problem) throw new Error('ADMIN_PASSWORD: ' + problem);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    db.prepare(`UPDATE users SET role = 'admin', status = 'active' WHERE id = ?`).run(existing.id);
  } else {
    const hash = await auth.hashPassword(password);
    db.prepare(`INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')`).run(email, name, hash);
  }
  console.log(`[setup] administrator ${email} is ready (from ADMIN_EMAIL / ADMIN_PASSWORD)`);
}

function start() {
  const db = open(config.databaseFile);
  const applied = migrate(db);
  if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`);
  if (!db.prepare(`SELECT 1 FROM users WHERE role = 'admin' LIMIT 1`).get()) {
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      // hosts without a permanent disk (Render free plan) start with an empty
      // database after every restart: recreate the administrator from env vars
      bootstrapAdmin(db).catch((e) => console.error('[setup] could not create the administrator:', e.message));
    } else {
      console.log('[setup] No administrator yet. Create one with:  npm run create-admin -- --email you@example.org --name "Your Name"');
    }
  }
  setInterval(() => auth.pruneSessions(db), 60 * 60e3).unref();
  const server = http.createServer(createApp(db));
  server.headersTimeout = 20e3;
  server.requestTimeout = 30e3;
  server.listen(config.port, config.host, () => {
    console.log(`[server] http://${config.host}:${config.port}  (site: ${config.siteRoot})`);
  });
  return server;
}

if (require.main === module) start();

module.exports = { createApp };
