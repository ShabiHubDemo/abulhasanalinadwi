// Checks the built site: every local link/asset must exist, and reports
// how many links still point at the old WordPress pages.
//
// Usage: node check.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['tools', 'node_modules', '.git']);

function* htmlFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* htmlFiles(path.join(dir, e.name));
    } else if (e.name.endsWith('.html')) {
      yield path.join(dir, e.name);
    }
  }
}

let files = 0, links = 0;
const broken = new Map();
const oldSite = new Map();

for (const file of htmlFiles(ROOT)) {
  files++;
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(/\s(?:href|src|action)="([^"]+)"/g)) {
    const url = m[1].replace(/&amp;/g, '&');
    links++;
    if (/^(https?:|mailto:|tel:|data:|javascript:|#)/i.test(url)) {
      // pages only: PDFs/MP3s/images are meant to stay on the media server
      if (/^https?:\/\/(www\.)?abulhasanalinadwi\.org\/(?!wp-content\/)/i.test(url) &&
          !/\.(pdf|mp3|jpe?g|png|gif|webp|docx?|zip)$/i.test(url.replace(/[?#].*$/, ''))) {
        const key = url.replace(/[?#].*$/, '');
        oldSite.set(key, (oldSite.get(key) || 0) + 1);
      }
      continue;
    }
    let target = decodeURI(url.replace(/[?#].*$/, ''));
    if (!target) continue;
    // served by server/ (admin panel, API), not files
    if (/^\/(admin|api)(\/|$)/.test(target)) continue;
    // "/assets/x.css" (admin panel) is relative to the site root
    const abs = target.startsWith('/') ? path.join(ROOT, target) : path.resolve(path.dirname(file), target);
    if (!fs.existsSync(abs)) {
      const from = path.relative(ROOT, file);
      if (!broken.has(target)) broken.set(target, from);
    }
  }
}

console.log(`[check] ${files} pages, ${links} links/assets checked`);
console.log(`[check] broken local links: ${broken.size}`);
for (const [t, from] of [...broken].slice(0, 25)) console.log('   ', t, '  (from', from + ')');
console.log(`[check] distinct links still going to old WordPress pages: ${oldSite.size}`);
for (const [u, n] of [...oldSite].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log('   ', n, u);
process.exitCode = broken.size ? 1 : 0;
