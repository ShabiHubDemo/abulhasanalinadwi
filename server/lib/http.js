// Minimal HTTP helpers: a router with middleware, JSON bodies, cookies and errors.

const MAX_BODY_BYTES = 100 * 1024;

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details; // e.g. { field: 'message' } for validation errors
  }
}

const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

function sendJson(res, status, body, extraHeaders = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { ...API_HEADERS, ...extraHeaders });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function sendError(res, err) {
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    const headers = err.status === 429 && err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {};
    return sendJson(res, err.status, body, headers);
  }
  // unexpected: log it, but never send internals to the client
  console.error('[error]', err && err.stack ? err.stack : err);
  return sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* ignore malformed */ }
  }
  return out;
}

function serializeCookie(name, value, opts = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${opts.path || '/'}; SameSite=${opts.sameSite || 'Strict'}`;
  if (opts.httpOnly !== false) c += '; HttpOnly';
  if (opts.secure) c += '; Secure';
  if (opts.maxAge !== undefined) c += `; Max-Age=${Math.floor(opts.maxAge)}`;
  return c;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const len = Number(req.headers['content-length'] || 0);
    if (len === 0 && !req.headers['transfer-encoding']) return resolve({});
    if (type !== 'application/json') return reject(new HttpError(415, 'Requests must be sent as JSON.'));
    if (len > MAX_BODY_BYTES) return reject(new HttpError(413, 'Request is too large.'));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Request is too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
        resolve(body);
      } catch (e) {
        reject(new HttpError(400, 'Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

// Router: route(method, '/api/admin/users/:id', ...handlers)
// Each handler is async (req, res, ctx); a handler that sends a response ends
// the chain, one that throws HttpError becomes an error response.
function createRouter() {
  const routes = [];
  function route(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handlers });
  }
  async function handle(req, res, ctx) {
    let pathMatched = false;
    for (const r of routes) {
      const m = r.re.exec(ctx.path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== req.method) continue;
      ctx.params = {};
      r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });
      for (const h of r.handlers) {
        await h(req, res, ctx);
        if (res.headersSent) return true;
      }
      return true;
    }
    if (pathMatched) throw new HttpError(405, 'Method not allowed.');
    return false;
  }
  return { route, handle };
}

module.exports = { HttpError, sendJson, sendError, parseCookies, serializeCookie, readJsonBody, createRouter };
