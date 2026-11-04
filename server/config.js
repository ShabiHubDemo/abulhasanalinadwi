// Runtime configuration, read from environment variables.
// See server/.env.example for the full list.

const path = require('path');

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

module.exports = {
  isProduction,
  port: Number(env.PORT || 3000),
  host: env.HOST || '127.0.0.1',
  // the website folder served as static files (the project root)
  siteRoot: path.resolve(env.SITE_ROOT || path.join(__dirname, '..')),
  databaseFile: path.resolve(env.DATABASE_FILE || path.join(__dirname, 'data', 'nadwicenter.db')),
  // Cookies get the Secure flag in production (site must be served over HTTPS).
  // COOKIE_SECURE=false only for local testing of a production build over http.
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProduction,
  // set when running behind a reverse proxy (nginx, Cloudflare…) so the client IP
  // used for rate limiting comes from X-Forwarded-For
  trustProxy: env.TRUST_PROXY === 'true',
  // allowed Origin for state-changing requests, e.g. https://abulhasanalinadwi.org
  // (defaults to the request's own host)
  publicOrigin: env.PUBLIC_ORIGIN || '',
  session: {
    idleMinutes: Number(env.SESSION_IDLE_MINUTES || 120),
    absoluteHours: Number(env.SESSION_ABSOLUTE_HOURS || 12),
  },
  loginRateLimit: {
    windowMinutes: 15,
    maxPerAccount: 5, // failed attempts for one email from one IP
    maxPerIp: 30, // failed attempts from one IP, any email
  },
};
