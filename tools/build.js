// Builds the static site from the crawl cache.
//
//  - every crawled page -> <slug>/index.html wrapped in the new header/footer
//  - the old pages' own component CSS -> assets/legacy.css, scoped to .legacy
//  - internal links rewritten to relative local paths (works from file:// too)
//  - assets/site-map.js (mirrored paths) and assets/search-index.js (search page)
//
// Usage: node build.js        (run crawl.js first)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const postcss = require('postcss');
const prefixer = require('postcss-prefix-selector');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');
const PAGES = path.join(CACHE, 'pages');
const index = JSON.parse(fs.readFileSync(path.join(CACHE, 'index.json'), 'utf8'));
const ORIGIN_RE = /^https?:\/\/(www\.)?abulhasanalinadwi\.org/i;

// Inline <style> blocks from WordPress core / plugins that we don't carry over.
const DROP_STYLE_ID = /^(wp-|global-styles|classic-theme|woocommerce-inline|mfn-dynamic|elementor|rs-|sr7|nadwi-(home|banner|footer|global-title))/;

// Old WordPress category archives that have a proper page on the new site.
// Links are pointed at the target, and the archive itself becomes a redirect.
const REDIRECTS = {
  '/category/audio/hamd-naat/': '/hamd-naat/',
  '/category/audio/mawlana-rabey-hasani-nadwi/': '/mawlana-rabey-hasani-nadwi/',
  '/category/audio/mawlana-abdullah-hasani-nadwi/': '/mawlana-abdullah-hasani-nadwi-audios/',
  '/category/audio/mawlana-abul-hasan-ali-nadwi/': '/category/audio/',
  '/category/audio/others/': '/category/audio/',
};

// Audio collections (and the Ramadhan audio archive) live under "Audio"
const AUDIO_PAGES = /^\/(urdu|molana-abul-hasan-arabic|hamd-naat|mawlana-rabey-hasani-nadwi|mawlana-abdullah-hasani-nadwi-audios|sayyid-bilal-abdul-hai-hasani|category\/ramazan|14\d\d(-\d)?)\/$/;

// ---------- page set ----------
const pages = new Map(); // site path -> {key, file}
const alias = new Map(); // requested path -> final path (redirects)
for (const [p, e] of Object.entries(index)) {
  if (e.status !== 200) continue;
  const file = path.join(PAGES, e.key + '.html');
  if (!fs.existsSync(file)) continue;
  const fin = e.finalPath || p;
  alias.set(p, fin);
  if (!pages.has(fin)) pages.set(fin, { key: e.key, file });
}

function toSitePath(href) {
  if (!href || !ORIGIN_RE.test(href)) return null;
  try {
    const u = new URL(href);
    let p = decodeURI(u.pathname);
    if (!p.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(p)) p += '/';
    return { path: alias.get(p) || p, search: u.search, hash: u.hash };
  } catch (e) {
    return null;
  }
}

function outFile(p) {
  return p === '/' ? 'index.html' : p.replace(/^\//, '') + 'index.html';
}

function rel(fromPath, toPath) {
  const depth = fromPath === '/' ? 0 : fromPath.split('/').filter(Boolean).length;
  return '../'.repeat(depth) + outFile(toPath);
}

function rootPrefix(fromPath) {
  const depth = fromPath === '/' ? 0 : fromPath.split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

// Rewrite one URL as seen from page `from`. Returns null to leave it alone.
function rewriteUrl(href, from) {
  const t = toSitePath(href);
  if (!t) return null;
  if (/^\/wp-content\//.test(t.path)) return null; // files stay on the media server
  // old WordPress search -> local search page
  if (t.path === '/' && /[?&]s=/.test(t.search)) {
    const q = new URLSearchParams(t.search).get('s') || '';
    return rootPrefix(from) + 'search/index.html' + (q ? '?q=' + encodeURIComponent(q) : '');
  }
  if (t.search) return null;
  const target = REDIRECTS[t.path] || t.path;
  if (!pages.has(target)) return null; // not mirrored -> keep the live link
  return rel(from, target) + (REDIRECTS[t.path] ? '' : (t.hash || ''));
}

// ---------- shared chrome from the homepage ----------
const homeSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const $home = cheerio.load(homeSrc, { decodeEntities: false });
const chrome = {
  header: $home.html($home('header.site-header')),
  subnav: $home.html($home('nav.sub-nav').closest('.container')),
  footer: $home.html($home('footer.site-footer')),
  tabbar: $home.html($home('nav.tab-bar')),
};

function section(p) {
  if (/^\/(book|book-category)\//.test(p)) return { name: 'Books', path: '/book/' };
  if (/^\/(magazines|category\/(payam-e-arafat-urdu|arafat-kiran-hindi))\//.test(p) || /payam|kiran|magazine/i.test(p)) return { name: 'Magazines', path: '/magazines/' };
  if (/^\/category\/audio\//.test(p) || AUDIO_PAGES.test(p)) return { name: 'Audio', path: '/category/audio/' };
  if (/^\/category\/videos\//.test(p)) return { name: 'Videos', path: '/category/videos/' };
  if (/^\/category\/ramadhan-1441\//.test(p)) return { name: 'Ramadhan', path: '/category/ramadhan-1441/' };
  if (/^\/category\/current-activities\//.test(p)) return { name: 'Current Activities', path: '/category/current-activities/' };
  if (/^\/question-answer/.test(p)) return { name: 'Question & Answer', path: '/question-answer/' };
  if (/^\/thoughts-of-mawlana/.test(p)) return { name: 'Thoughts', path: '/thoughts-of-mawlana-abul-hasan-ali-nadwi-urdu/' };
  if (/^\/research-scholars/.test(p)) return { name: 'Research Scholars', path: '/research-scholars/' };
  return null;
}

function renderChrome(html, from, activeName) {
  const $ = cheerio.load(html, { decodeEntities: false }, false);
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (href.startsWith('#')) {
      // in-page anchors from the homepage point back at the homepage
      if (from !== '/' && href.length > 1 && href !== '#search') $(a).attr('href', rootPrefix(from) + 'index.html' + href);
      return;
    }
    if (href.startsWith('/')) return; // server routes like /admin/login stay as they are
    if (!/^[a-z]+:/i.test(href)) {
      // already-local link written relative to the homepage
      $(a).attr('href', rootPrefix(from) + href);
      return;
    }
    const r = rewriteUrl(href, from);
    if (r) $(a).attr('href', r);
  });
  $('[data-focus-search]').attr('href', rootPrefix(from) + 'search/index.html').removeAttr('data-focus-search');
  $('.pill-link, .tab-bar a').removeClass('is-active');
  if (activeName) {
    $('.pill-link, .tab-bar a').filter((_, a) => $(a).text().trim() === activeName).addClass('is-active');
  } else if (from === '/') {
    $('.pill-link, .tab-bar a').first().addClass('is-active');
  }
  $('img[src^="assets/"]').each((_, i) => $(i).attr('src', rootPrefix(from) + $(i).attr('src')));
  return $.html();
}

// ---------- legacy CSS ----------
const styleBlocks = new Map();
function collectStyles($) {
  $('style').each((_, s) => {
    const id = $(s).attr('id') || '';
    if (DROP_STYLE_ID.test(id)) return;
    const css = $(s).html() || '';
    if (!css.trim() || /@font-face/.test(css) && css.length < 400) return;
    const h = crypto.createHash('md5').update(css).digest('hex');
    if (!styleBlocks.has(h)) styleBlocks.set(h, { id, css });
  });
}

function scopeCss(css) {
  return postcss([
    prefixer({
      prefix: '.legacy',
      transform(prefix, selector, prefixed) {
        // site chrome of the old theme never appears inside .legacy
        if (/#(Header|Footer|Top_bar|Action_bar|Subheader)\b|\.(home|mfn-footer|header_placeholder)\b/.test(selector)) return '.legacy-dropped';
        if (/^(html|:root)\b/.test(selector)) return selector.replace(/^(html\s*body|html|:root)/, prefix);
        if (/^body\b/.test(selector)) return selector.replace(/^body/, prefix);
        return prefixed;
      },
    }),
  ]).process(css, { from: undefined }).css;
}

// ---------- content clean-up ----------
// Direct APK downloads, hosted as GitHub Release assets. "latest/download"
// always serves the newest release, so the link never changes between versions.
const APK_DOWNLOADS = {
  '/aasaan-maani-quran-android-app/': {
    apk: 'https://github.com/ShabiHubDemo/abulhasanalinadwi/releases/latest/download/aasaan-maani-quran.apk',
    play: 'https://play.google.com/store/apps/details?id=com.hl.aasaanmaaniquran',
  },
};

function apkDownloadBlock({ apk, play }) {
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M5 21h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return `<div class="app-download">
  <a class="app-download__btn" href="${apk}" download>${icon}Download APK</a>
  <a class="btn-outline" href="${play}" target="_blank" rel="noopener">Get it on Google Play</a>
  <p class="app-download__note">Installing the APK directly? Your phone will ask you to allow “Install unknown apps” for your browser.</p>
</div>`;
}

function cleanContent($, $c, from) {
  if (APK_DOWNLOADS[from]) {
    const $target = $c.find('.the_content_wrapper').first();
    ($target.length ? $target : $c).prepend(apkDownloadBlock(APK_DOWNLOADS[from]));
  }
  // MediaElement.js players -> plain native audio (the old player needs its scripts)
  $c.find('.mejs-container').each((_, m) => {
    const $m = $(m);
    const $a = $m.find('audio').first();
    const src = ($a.attr('src') || $a.find('source').attr('src') || '').replace(/\?_=\d+$/, '');
    if (!src) return;
    $m.replaceWith(`<audio class="native-audio" controls preload="none" src="${src}"></audio>`);
  });
  $c.find('.nadwi-player-cell > .mejs-offscreen').remove();
  // "Search in <collection>" only works with WordPress search
  $c.find('.nb-search-collection').remove();
  // prev/next arrows drawn with the old theme's icon font
  $c.find('.post-nav').remove();
  // jQuery UI tabs (book "Description") -> a heading above each panel
  $c.find('ul.wc-tabs, ul.tabs.ui-tabs-nav').each((_, ul) => {
    const $ul = $(ul);
    const $wrap = $ul.parent();
    $ul.find('li a[href^="#"]').each((_, a) => {
      const $panel = $wrap.find($(a).attr('href'));
      const label = $(a).text().trim();
      if ($panel.length && label) $panel.prepend(`<h3 class="tab-heading">${label}</h3>`);
    });
    $ul.remove();
  });
  // the old theme's "Filter by" dropdowns need its scripts; without them they
  // print as a long bullet list (and the tag/author lists show login names)
  $c.find('#Filters').remove();
  // blog cards: "Do you like it?" like-button, empty image frames
  $c.find('.post-item .button-love, .post-item.no-img .image_frame, .post-item .post-head:empty').remove();

  $c.find('script, noscript, link, meta, .screen-reader-response').remove();
  $c.find('#Subheader, .mfn-main-slider').remove();
  $c.find('*').each((_, el) => {
    for (const name of Object.keys(el.attribs || {})) {
      if (/^on/i.test(name)) $(el).removeAttr(name);
    }
  });
  // lazy-loaded images
  $c.find('img').each((_, i) => {
    const $i = $(i);
    const real = $i.attr('data-lazy-src') || $i.attr('data-src');
    if (real) $i.attr('src', real);
    const set = $i.attr('data-lazy-srcset') || $i.attr('data-srcset');
    if (set) $i.attr('srcset', set);
    if (!$i.attr('loading')) $i.attr('loading', 'lazy');
  });
  // root-relative URLs ("/urdu/", "/wp-content/…") would resolve against the
  // new host's root, so make them absolute first
  const absolute = (u) => (/^\/(?!\/)/.test(u) ? 'https://abulhasanalinadwi.org' + u : u);
  $c.find('img[src], source[src], audio[src], video[src], iframe[src]').each((_, el) => {
    $(el).attr('src', absolute($(el).attr('src')));
  });
  $c.find('a[href]').each((_, a) => {
    const href = absolute($(a).attr('href'));
    $(a).attr('href', rewriteUrl(href, from) || href);
  });
  // Contact Form 7 needs WordPress + a reCAPTCHA token bound to the old domain;
  // posted from here the question would be dropped as spam. Send it by email.
  $c.find('form.wpcf7-form').each((_, f) => {
    const $f = $(f);
    $f.find('.hidden-fields-container, input[type="hidden"]').remove();
    $f.find('[aria-required="true"]').attr('required', '');
    $f.removeAttr('novalidate').attr({
      action: 'mailto:askus@abulhasanalinadwi.org', method: 'post', enctype: 'text/plain',
      'data-mailto': 'askus@abulhasanalinadwi.org',
    });
    $f.find('[type="submit"]').last().after(
      '<p class="mail-note">Your email app will open with your question ready to send to askus@abulhasanalinadwi.org.</p>');
  });

  // WordPress search forms -> local search page
  $c.find('form').each((_, f) => {
    const $f = $(f);
    const action = $f.attr('action') || '';
    const isSearch = $f.find('input[name="s"]').length && (!action || toSitePath(action)?.path === '/');
    if (isSearch) {
      $f.attr('action', rootPrefix(from) + 'search/index.html').attr('method', 'get');
      $f.find('input[name="s"]').attr('name', 'q');
      $f.find('input[name="post_type"], input[name="product_cat"]').remove();
    } else if (action && !/^(https?|mailto):/i.test(action)) {
      // e.g. Contact Form 7 posts back to the live WordPress page
      $f.attr('action', new URL(action, 'https://abulhasanalinadwi.org' + from).href);
    }
  });
}

function textOf($, $c) {
  return $c.clone().find('style, script, form').remove().end().text().replace(/\s+/g, ' ').trim();
}

// ---------- page template ----------
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function pageTemplate({ from, title, description, bodyClass, content, hasOwnHero, extraScripts = '' }) {
  const sec = section(from);
  const pre = rootPrefix(from);
  const crumbs = [`<a href="${pre}index.html">Home</a>`];
  if (sec && sec.path !== from && pages.has(sec.path)) crumbs.push(`<a href="${rel(from, sec.path)}">${esc(sec.name)}</a>`);
  crumbs.push(`<span aria-current="page">${esc(title)}</span>`);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="site-root" content="${pre}">
  <title>${esc(title)} – Abul Hasan Ali Nadwi Center</title>
  <meta name="description" content="${esc(description)}">
  <link rel="icon" href="https://abulhasanalinadwi.org/wp-content/uploads/2017/11/abulhasanadwi-favi-icon.jpg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${pre}assets/legacy.css">
  <link rel="stylesheet" href="${pre}assets/styles.css">
</head>
<body class="subpage">

${renderChrome(chrome.header, from, sec && sec.name)}

<main>
${renderChrome(chrome.subnav, from)}

  <section class="container">
    <div class="page-hero${hasOwnHero ? ' page-hero--compact' : ''}">
      <nav class="breadcrumbs" aria-label="Breadcrumb">${crumbs.join('<span class="sep">/</span>')}</nav>
      ${hasOwnHero ? '' : `<h1 class="page-hero__title">${esc(title)}</h1>`}
    </div>
  </section>

  <div class="container">
    <div class="legacy ${esc(bodyClass)}">
${content}
    </div>
  </div>
</main>

${renderChrome(chrome.footer, from)}
${renderChrome(chrome.tabbar, from, sec && sec.name)}

<script src="${pre}assets/site-map.js"></script>${extraScripts}
<script src="${pre}assets/app.js"></script>
</body>
</html>
`;
}

// ---------- build ----------
// --special-only: just the search / account / 404 pages (seconds instead of minutes)
const SPECIAL_ONLY = process.argv.includes('--special-only');
const searchIndex = [];
const bookCats = {}; // term id -> { n, u, p }
const qaIndex = [];
let built = 0;
for (const [p, { file }] of SPECIAL_ONLY ? [] : pages) {
  if (p === '/') continue; // the homepage is hand-built
  if (REDIRECTS[p] && pages.has(REDIRECTS[p])) {
    // old archive URL: forward visitors (and bookmarks) to the proper page
    const to = rel(p, REDIRECTS[p]);
    const out = path.join(ROOT, outFile(p));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Redirecting…</title>\n<meta http-equiv="refresh" content="0; url=${to}">\n<script>location.replace(${JSON.stringify(to)} + location.hash)</script>\n</head><body><p><a href="${to}">Continue to the audio collection →</a></p></body></html>\n`);
    built++;
    continue;
  }
  // the old inline scripts are ~60% of each page and never used: drop before parsing
  const raw = fs.readFileSync(file, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const $ = cheerio.load(raw, { decodeEntities: false });
  collectStyles($);

  const rawTitle = $('#Subheader h1').first().text().trim() || $('title').text().split(/\s+[–|-]\s+/)[0].trim();
  const title = rawTitle.replace(/\s+/g, ' ');
  const pretty = title === title.toUpperCase() ? title.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : title;
  const description = $('meta[name="description"]').attr('content') || '';
  const bodyClass = ($('body').attr('class') || '').split(/\s+/).filter((c) => !/^(home|page-id-|postid-|elementor|e--|mfn-|layout-|header-|footer-|menu-|sticky|ofcs|boxed|hide-|today|logo-|nice-|no-|be-|button-|responsive|keyboard|wp-theme|theme-|ajax|woocommerce-js|js$)/.test(c)).join(' ');

  const $content = $('#Content').first();
  if (!$content.length) continue;

  // book categories: term id -> page, for the "Browse by author & language" picker
  const term = (($('body').attr('class') || '').match(/\bterm-(\d+)\b/) || [])[1];
  // (page 2, 3… of a category share its term id; keep the first page's URL)
  if (term && /^\/book-category\//.test(p) && !/\/page\/\d+\/$/.test(p)) {
    bookCats[term] = { n: title, u: p };
  }

  // every Q&A entry, for "Search all questions"
  if (/^\/question-answer(-\d+)?\/$/.test(p)) {
    $content.find('details.nq-question').each((_, d) => {
      const $d = $(d);
      qaIndex.push({
        t: $d.find('summary h3').text().trim(),
        u: p,
        h: $d.attr('id') || '',
        x: $d.find('.nq-answer').text().replace(/\s+/g, ' ').trim().slice(0, 600),
      });
    });
  }

  cleanContent($, $content, p);
  // keep any <style> the page's widgets carry inside the content
  $content.find('style').each((_, s) => {
    collectStyles(cheerio.load(`<style>${$(s).html()}</style>`));
    $(s).remove();
  });

  const hasOwnHero = $content.find('[class*="-hero"]').filter((_, e) => /(^|\s)[a-z]{2,3}-hero(\s|$)/.test($(e).attr('class'))).length > 0;
  let extraScripts = '';
  if ($content.find('.nb-browse').length) extraScripts += `\n<script src="${rootPrefix(p)}assets/catalogue.js"></script>`;
  if ($content.find('.nq-search-row').length) extraScripts += `\n<script src="${rootPrefix(p)}assets/qa-index.js"></script>`;
  const html = pageTemplate({ from: p, title: pretty, description, bodyClass, content: $.html($content), hasOwnHero, extraScripts });

  const out = path.join(ROOT, outFile(p));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  built++;

  const text = textOf($, $content);
  searchIndex.push({ t: pretty, u: p, s: section(p)?.name || '', x: text.slice(0, 1000) });
}

// search page (replaces WordPress search)
pages.set('/search/', { key: 'search' });
{
  const from = '/search/';
  const out = path.join(ROOT, outFile(from));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, pageTemplate({
    from,
    title: 'Search',
    description: 'Search books, magazines, audio, videos and articles of the Abul Hasan Ali Nadwi Center.',
    bodyClass: '',
    extraScripts: `\n<script src="${rootPrefix(from)}assets/search-index.js"></script>`,
    content: `<div class="search-page" data-search>
      <label class="search-page__field">
        <span class="sr-only">Search</span>
        <input type="search" placeholder="Search books, magazines, audio and articles…" autofocus>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      </label>
      <p class="search-page__count" data-search-count></p>
      <div class="search-page__results" data-search-results></div>
    </div>`,
  }));
}

// The 404 page is served for any missing URL, so its links need a <base>.
// The site normally sits at the root ("/"); on GitHub Pages it sits under the
// repository name (PAGES_BASE, e.g. "/abulhasanalinadwi/"), detected at runtime.
function baseTag() {
  const sub = (process.env.PAGES_BASE || '/abulhasanalinadwi/').replace(/^\/?/, '/').replace(/\/?$/, '/');
  return `  <script>document.write('<base href="' + (location.pathname.indexOf(${JSON.stringify(sub)}) === 0 ? ${JSON.stringify(sub)} : '/') + '">');</script>`;
}

// 404 page: served for any missing URL, so it uses root-absolute links via <base>
{
  const html = pageTemplate({
    from: '/',
    title: 'Page not found',
    description: 'The page you were looking for could not be found.',
    bodyClass: '',
    content: `<div class="not-found">
      <p class="not-found__code">404</p>
      <h2>We couldn’t find that page</h2>
      <p>It may have moved when the website was redesigned. Try searching, or start from one of these:</p>
      <form class="not-found__search" action="search/index.html" method="get" role="search">
        <input type="search" name="q" placeholder="Search books, magazines, audio…" aria-label="Search">
        <button type="submit">Search</button>
      </form>
      <div class="not-found__links">
        <a href="index.html">Home</a><a href="book/index.html">Books</a><a href="magazines/index.html">Magazines</a><a href="category/audio/index.html">Audio</a><a href="contact/index.html">Contact</a>
      </div>
    </div>`,
  }).replace('<head>', '<head>\n' + baseTag());
  fs.writeFileSync(path.join(ROOT, '404.html'), html);
}

// visitor accounts: sign in / create account / my account (filled in by app.js).
// Accounts need the server, so the static fallback just says so.
{
  const from = '/account/';
  const out = path.join(ROOT, outFile(from));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, pageTemplate({
    from,
    title: 'Your account',
    description: 'Sign in or create a free account on the Abul Hasan Ali Nadwi Center website.',
    bodyClass: '',
    content: `<div class="account-page" data-account>
      <div class="account-card">
        <h2>Accounts are available on the live website</h2>
        <p>Signing in needs the website’s server. You’re viewing a copy that was opened from disk.</p>
      </div>
    </div>`,
  }));
}

if (SPECIAL_ONLY) {
  console.log('[build] special pages written (search, account, 404)');
  process.exit(0);
}

// legacy css (scoped)
let legacy = '/* Generated by tools/build.js from the old site\'s page styles. Do not edit by hand. */\n';
for (const { id, css } of styleBlocks.values()) {
  try {
    legacy += `\n/* ${id || 'inline'} */\n` + scopeCss(css);
  } catch (e) {
    console.warn('skipped a style block that failed to parse:', id, e.message);
  }
}
fs.writeFileSync(path.join(ROOT, 'assets', 'legacy.css'), legacy);

// site map + search index (JS files so they also load from file://)
const mirrored = [...pages.keys()];
fs.writeFileSync(path.join(ROOT, 'assets', 'site-map.js'),
  'window.SITE_PAGES=' + JSON.stringify(mirrored) + ';window.SITE_ALIASES=' + JSON.stringify(Object.fromEntries([...alias].filter(([a, b]) => a !== b))) + ';\n');
fs.writeFileSync(path.join(ROOT, 'assets', 'search-index.js'), 'window.SEARCH_INDEX=' + JSON.stringify(searchIndex) + ';\n');

// category tree: a category's parent is the category one path segment up
const byPath = Object.fromEntries(Object.entries(bookCats).map(([id, c]) => [c.u, id]));
for (const c of Object.values(bookCats)) {
  const up = c.u.replace(/[^/]+\/$/, '');
  if (byPath[up]) c.p = byPath[up];
}
fs.writeFileSync(path.join(ROOT, 'assets', 'catalogue.js'), 'window.BOOK_CATS=' + JSON.stringify(bookCats) + ';\n');
fs.writeFileSync(path.join(ROOT, 'assets', 'qa-index.js'), 'window.QA_INDEX=' + JSON.stringify(qaIndex) + ';\n');

// homepage: rewrite live links to local pages
let home = homeSrc.replace(/(href|action)="(https?:\/\/(?:www\.)?abulhasanalinadwi\.org[^"]*)"/g, (m, attr, url) => {
  const r = rewriteUrl(url.replace(/&amp;/g, '&'), '/');
  return r ? `${attr}="${r}"` : m;
});
fs.writeFileSync(path.join(ROOT, 'index.html'), home);

console.log(`[build] ${built} pages written, ${styleBlocks.size} style blocks -> assets/legacy.css, ${searchIndex.length} search entries`);
