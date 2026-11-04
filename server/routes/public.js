// /api/public/* — read by the public website. Only published content and
// public settings; nothing here needs or reveals an account.

const { HttpError, sendJson } = require('../lib/http');
const v = require('../lib/validate');
const auth = require('../lib/auth');
const { createLimiter } = require('../lib/ratelimit');
const { readSettings } = require('./admin');

const PUBLIC_SETTINGS = ['contact_email', 'contact_phone', 'contact_address', 'youtube_url', 'questions_open'];
const askLimiter = createLimiter({ windowMs: 60 * 60e3, max: 5 }); // questions per IP per hour

function register(router, { db }) {
  router.route('GET', '/api/public/home', async (req, res) => {
    const videos = db.prepare('SELECT * FROM videos WHERE is_published = 1 ORDER BY sort_order, id').all();
    const pick = (kind) => videos.filter((r) => r.kind === kind).map((r) => ({
      youtubeId: r.youtube_id, title: r.title, series: r.series, pagePath: r.page_path,
      durationSeconds: r.duration_seconds, uploadedOn: r.uploaded_on,
    }));
    const magazines = db.prepare('SELECT * FROM magazines WHERE is_published = 1 ORDER BY sort_order, id').all().map((m) => ({
      slug: m.slug, name: m.name, nativeName: m.native_name, language: m.language, langCode: m.lang_code,
      textDir: m.text_dir, issueLabel: m.issue_label, coverUrl: m.cover_url, pdfUrl: m.pdf_url,
      archivePath: m.archive_path, sinceYear: m.since_year,
    }));
    const all = readSettings(db);
    const settings = Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, all[k]]));
    // short cache: admin changes show up within a minute
    sendJson(res, 200, { reels: pick('reel'), videos: pick('video'), magazines, settings }, { 'Cache-Control': 'public, max-age=60' });
  });

  router.route('POST', '/api/public/questions', auth.requireSameOrigin(), async (req, res, ctx) => {
    const settings = readSettings(db);
    if (settings.questions_open !== 'true') throw new HttpError(503, 'We are not accepting new questions at the moment.');
    const b = ctx.body;
    // hidden "website" field: people leave it empty, spam bots fill it in
    if (b.website) return sendJson(res, 201, { ok: true });
    const wait = askLimiter.retryAfter(ctx.ip);
    if (wait) {
      const err = new HttpError(429, 'You’ve sent several questions already. Please try again later.');
      err.retryAfter = wait;
      throw err;
    }
    const row = {
      subject: v.text(b, 'subject', { label: 'Subject', max: 200 }),
      question: v.text(b, 'question', { label: 'Your question', required: true, min: 10, max: 5000, multiline: true }),
      name: v.text(b, 'name', { label: 'Your name', required: true, max: 100 }),
      email: v.email(b, 'email', { label: 'Email address' }),
      address: v.text(b, 'address', { label: 'Address', max: 500, multiline: true }),
      gender: v.oneOf(b, 'gender', ['Male', 'Female'], { label: 'Gender', required: false }) || '',
    };
    askLimiter.hit(ctx.ip);
    db.prepare('INSERT INTO questions (subject, question, name, email, address, gender) VALUES (?, ?, ?, ?, ?, ?)')
      .run(row.subject, row.question, row.name, row.email, row.address, row.gender);
    sendJson(res, 201, { ok: true });
  });
}

module.exports = { register };
