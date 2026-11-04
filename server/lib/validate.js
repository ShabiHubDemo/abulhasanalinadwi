// Input validation. Each helper returns the clean value or throws a 400
// HttpError naming the field, so controllers stay short.

const { HttpError } = require('./http');

function fail(field, message) {
  throw new HttpError(400, message, { field });
}

// strip control characters (keeps newlines/tabs for multi-line text)
function clean(s, multiline) {
  return String(s).replace(multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '').trim();
}

function text(body, field, { label = field, required = false, max = 200, min = 0, multiline = false } = {}) {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === '') {
    if (required) fail(field, `${label} is required.`);
    return '';
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') fail(field, `${label} must be text.`);
  const v = clean(raw, multiline);
  if (required && !v) fail(field, `${label} is required.`);
  if (v.length > max) fail(field, `${label} must be at most ${max} characters.`);
  if (v && v.length < min) fail(field, `${label} must be at least ${min} characters.`);
  return v;
}

function email(body, field = 'email', { required = true, label = 'Email' } = {}) {
  const v = text(body, field, { label, required, max: 254 }).toLowerCase();
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) fail(field, `${label} is not a valid email address.`);
  return v;
}

function oneOf(body, field, allowed, { label = field, required = true } = {}) {
  const v = body[field];
  if (v === undefined || v === null || v === '') {
    if (required) fail(field, `${label} is required.`);
    return undefined;
  }
  if (!allowed.includes(v)) fail(field, `${label} must be one of: ${allowed.join(', ')}.`);
  return v;
}

function bool(body, field, { required = false, label = field } = {}) {
  const v = body[field];
  if (v === undefined) {
    if (required) fail(field, `${label} is required.`);
    return undefined;
  }
  if (typeof v !== 'boolean') fail(field, `${label} must be true or false.`);
  return v;
}

function int(body, field, { min = 0, max = 1e9, required = false, label = field } = {}) {
  const v = body[field];
  if (v === undefined || v === null || v === '') {
    if (required) fail(field, `${label} is required.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(field, `${label} must be a whole number between ${min} and ${max}.`);
  return n;
}

function httpUrl(body, field, { required = false, label = field } = {}) {
  const v = text(body, field, { label, required, max: 1000 });
  if (!v) return '';
  let u;
  try { u = new URL(v); } catch (e) { fail(field, `${label} must be a full web address (https://…).`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') fail(field, `${label} must start with https://`);
  return u.href;
}

// a path on this website, e.g. /darse-quran-5th-ramadhan-1441h/
function sitePath(body, field, { required = false, label = field } = {}) {
  let v = text(body, field, { label, required, max: 300 });
  if (!v) return '';
  v = v.replace(/^https?:\/\/(www\.)?abulhasanalinadwi\.org/i, '');
  if (!v.startsWith('/')) v = '/' + v;
  if (!v.endsWith('/')) v += '/';
  if (!/^\/[\p{L}\p{N}\-._~/%]*$/u.test(v) || v.includes('..') || v.includes('//')) fail(field, `${label} must be a page address on this site, like /book/.`);
  return v;
}

function date(body, field, { required = false, label = field } = {}) {
  const v = text(body, field, { label, required, max: 10 });
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) fail(field, `${label} must be a date (YYYY-MM-DD).`);
  return v;
}

// accepts an 11-character ID or any common YouTube URL form
function youtubeId(body, field = 'youtube', { label = 'YouTube link' } = {}) {
  const v = text(body, field, { label, required: true, max: 300 });
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  let u;
  try { u = new URL(v); } catch (e) { fail(field, `${label} must be a YouTube URL or video ID.`); }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1, 12);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/) || [])[1];
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) fail(field, `Couldn’t find a video ID in that ${label}.`);
  return id;
}

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Not found.');
  return n;
}

function pageParams(query, { maxSize = 100, defaultSize = 20 } = {}) {
  const page = Math.max(1, Math.floor(Number(query.get('page')) || 1));
  const size = Math.min(maxSize, Math.max(1, Math.floor(Number(query.get('pageSize')) || defaultSize)));
  return { page, size, offset: (page - 1) * size };
}

module.exports = { text, email, oneOf, bool, int, httpUrl, sitePath, date, youtubeId, idParam, pageParams, fail };
