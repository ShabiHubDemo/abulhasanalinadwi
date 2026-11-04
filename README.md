# Abul Hasan Ali Nadwi Center — new website

A static copy of abulhasanalinadwi.org in the new design. Every page from the
old site (books, magazines, audio, videos, Q&A, research scholars, …) has been
carried over with its content and opens in the new layout. Links between pages
stay inside the new site.

## View it

Double-click `index.html`. No server is needed. Everything works straight from
the folder, including search and the audio players.

## Admin panel

The site now has an admin panel at `/admin`. It handles:
- the Ask-us questions inbox
- the homepage Shorts & Reels, Videos and Magazines
- user accounts and roles
- the activity log and the website contact settings.

It runs on the small Node.js server in `server/`. See [server/README.md](server/README.md):

```bash
cd server
npm run create-admin -- --email you@example.org --name "Your Name"
npm start            # then open http://127.0.0.1:3000/admin/login
```

## Put it online

**With the admin panel (recommended):** run `server/` on a host that supports
Node.js 22, behind HTTPS. It serves the whole website as well as `/admin` and
`/api`. Details are in [server/README.md](server/README.md).

**Without the admin panel:** upload everything except `tools/` and `server/`
to any static host (Netlify, Cloudflare Pages, GitHub Pages, or public_html).
Set `404.html` as the "not found" page if the host asks. The homepage then
shows its built-in reels, videos and magazines, and Ask us falls back to email.

Images, PDFs and MP3s are still served from
`abulhasanalinadwi.org/wp-content/uploads/`, so **keep the old WordPress
uploads online** (or copy that folder to the new host at the same path).

## What changed and what still uses WordPress

| Feature | How it works now |
|---|---|
| Site search | New local search page (`search/`), searches every page |
| Q&A search, expand/collapse, author/audio/activity filters | Rebuilt in `assets/app.js` |
| Book browser (author → language) | Rebuilt from `assets/catalogue.js` |
| Audio players | Native browser players, no plugin |
| Email subscription (footer) | Posts to the existing Mailchimp list |
| **Ask us form** | With the server: goes to the admin inbox (validated, spam trap, 5 per hour per visitor). Without it, or if the server is down, it opens the visitor's email app addressed to askus@abulhasanalinadwi.org |
| Homepage reels, videos, magazines, footer contact details | Managed in the admin panel when the server runs. Built-in copies are used on static hosting |
| Dark mode | Header, footer and homepage go dark. Old page content stays on a light panel so it stays readable |

## Updating the content

The content was copied from the live site. After someone adds books or
magazines in WordPress, refresh the copy (needs Node.js and Google Chrome):

```bash
cd tools
npm install        # first time only
npm run refresh    # re-copy every page, rebuild, check links (takes ~1 hour)
```

`npm run crawl` only fetches pages that aren't cached yet, `npm run build`
rebuilds from the cache in a few minutes, and `npm run check` reports any
broken links.

## Files

- `index.html`: the homepage (hand-built)
- `assets/styles.css`: the design (colours and spacing are variables at the top)
- `assets/app.js`: menus, shelves, search and page widgets
- `assets/legacy.css`: generated, the old pages' component styles scoped to the new layout
- `assets/search-index.js`, `catalogue.js`, `qa-index.js`, `site-map.js`: generated data for search and widgets
- `*/index.html`: generated pages, one folder per old URL; `404.html` is the not-found page
- `admin/index.html`, `assets/admin.css`, `assets/admin.js`: the admin panel
- `server/`: web server, API, database migrations and tests for the admin panel
- `tools/`: the crawl/build scripts (not needed on the web server)
