// Crawls the live WordPress site with the locally installed Chrome and saves
// the *rendered* HTML of every internal page (the old site rebuilds many pages
// with JavaScript after load, so the raw HTML is not what visitors see).
//
// Usage:  node crawl.js [--max=2000] [--fresh]
// Output: tools/.cache/pages/<key>.html  +  tools/.cache/index.json

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ORIGIN = 'https://abulhasanalinadwi.org';
const CACHE = path.join(__dirname, '.cache');
const PAGES = path.join(CACHE, 'pages');
const INDEX = path.join(CACHE, 'index.json');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const MAX = Number(args.max || 2000);
const CONCURRENCY = Number(args.concurrency || 6);

const SEEDS = [
  '/', '/aims-and-objectives/', '/departments-of-abul-hasan-ali-nadwi-center/', '/infrastructure/',
  '/opinions/', '/research-scholars/', '/life-and-works/', '/thoughts-of-mawlana-abul-hasan-ali-nadwi-urdu/',
  '/magazines/', '/book/', '/category/ramadhan-1441/', '/category/videos/', '/category/audio/',
  '/ask-us/', '/question-answer/', '/category/current-activities/', '/contact/',
];

// Pages we never mirror: WordPress internals, feeds, shop flows, query URLs.
const SKIP = /^\/(wp-|feed|comments|cart|checkout|my-account|shop|xmlrpc|tag\/|author\/)|\/feed\/?$|\/embed\/?$|\/amp\/?$|\.(pdf|jpe?g|png|gif|webp|mp3|mp4|zip|docx?|xml|txt)\/?$/i;

function normalise(href) {
  try {
    const u = new URL(href, ORIGIN);
    if (!/^(www\.)?abulhasanalinadwi\.org$/.test(u.hostname)) return null;
    if (u.search) return null;
    let p = decodeURI(u.pathname);
    if (SKIP.test(p)) return null; // test before adding the slash, or "x.pdf" becomes "x.pdf/"
    if (!p.endsWith('/')) p += '/';
    return p;
  } catch (e) {
    return null;
  }
}

function keyFor(p) {
  return p === '/' ? '_home' : p.replace(/^\/|\/$/g, '').replace(/[\\/:*?"<>|]/g, '__');
}

async function main() {
  fs.mkdirSync(PAGES, { recursive: true });
  const index = !args.fresh && fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : {};
  // re-filter cached links in case the skip rules changed
  for (const p of Object.keys(index)) if (!normalise(ORIGIN + encodeURI(p))) delete index[p];
  for (const e of Object.values(index)) e.links = (e.links || []).filter((l) => normalise(ORIGIN + encodeURI(l)));
  const queue = [...new Set([...SEEDS, ...Object.values(index).flatMap((e) => e.links || [])])];
  const seen = new Set(queue);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
  });

  let done = 0;
  async function visit(p) {
    const key = keyFor(p);
    const file = path.join(PAGES, key + '.html');
    if (index[p] && fs.existsSync(file)) return index[p].links || [];

    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const t = r.resourceType();
      const u = r.url();
      if (t === 'image' || t === 'media' || t === 'font' ||
          /google-analytics|googletagmanager|recaptcha|gstatic|doubleclick|facebook|youtube\.com\/(embed|s\/)/.test(u)) {
        r.abort();
      } else {
        r.continue();
      }
    });
    try {
      const res = await page.goto(ORIGIN + encodeURI(p), { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 800));
      const status = res ? res.status() : 0;
      const finalPath = normalise(page.url()) || p;
      const html = await page.content();
      const links = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
      const internal = [...new Set(links.map(normalise).filter(Boolean))];
      fs.writeFileSync(file, html);
      index[p] = { key, status, finalPath, links: internal };
      return internal;
    } catch (e) {
      index[p] = { key, status: 0, error: String(e.message || e), links: [] };
      return [];
    } finally {
      await page.close().catch(() => {});
      done++;
      if (done % 10 === 0) {
        fs.writeFileSync(INDEX, JSON.stringify(index));
        console.log(`[crawl] ${done} done, ${queue.length} queued, ${seen.size} seen`);
      }
    }
  }

  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      const links = await visit(p);
      for (const l of links) {
        if (!seen.has(l) && seen.size < MAX) {
          seen.add(l);
          queue.push(l);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  fs.writeFileSync(INDEX, JSON.stringify(index));
  await browser.close();

  const ok = Object.values(index).filter((e) => e.status === 200).length;
  const failed = Object.entries(index).filter(([, e]) => e.status !== 200);
  console.log(`[crawl] finished: ${ok} pages OK, ${failed.length} not OK, cap ${MAX}`);
  for (const [p, e] of failed.slice(0, 30)) console.log('  ', e.status, p, e.error || '');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
