# Website server and admin panel

The website is static HTML. This server serves those files exactly as before
and adds:

- an **admin panel** at `/admin`, with sign-in, dashboard, Ask-us inbox,
  Shorts & Reels, Videos, Magazines, Users, Activity log and Settings;
- a **JSON API** under `/api`, which the admin panel and the public homepage use;
- a **SQLite database** (one file, `server/data/nadwicenter.db` by default).

It needs Node.js 22.13 or newer and has **no npm dependencies**: the database,
password hashing and web server are all built into Node.

## Run it

```bash
cd server
npm run migrate                                   # create / update the database
npm run create-admin -- --email you@example.org --name "Your Name"
npm start                                         # http://127.0.0.1:3000
```

`create-admin` asks for the password at a hidden prompt. To promote an
existing account instead: `npm run create-admin -- --email them@example.org --promote`.

Then open `http://127.0.0.1:3000/admin/login`.

`npm start` also applies pending migrations, so on a server `npm start`
alone is enough after the first admin exists.

## Tests

```bash
cd server
npm test
```

They start the real server on a temporary database and check sign-in, roles,
401/403 responses, CSRF, rate limiting, expired sessions, user management
safeguards, content reaching the homepage, the Ask-us inbox and static file
safety.

## Production

1. Copy the whole project folder to the server (the `tools/` folder isn't needed there).
2. Set the environment variables from `.env.example`. At minimum:
   `NODE_ENV=production`, `PUBLIC_ORIGIN=https://your-domain`, and
   `DATABASE_FILE` pointing somewhere that gets backed up.
3. Put it behind HTTPS (nginx, Caddy or Cloudflare) and set `TRUST_PROXY=true`.
   In production the session cookie is `Secure`, so **sign-in only works over HTTPS**.
4. Run `npm start` under a process manager (systemd, pm2) so it restarts.
5. Back up the database file regularly.

## Roles

| Role | Can do |
|---|---|
| `user` | Sign in only. No admin access (there are no member features on the site yet). |
| `editor` | Dashboard, Ask-us questions, Shorts & Reels, Videos, Magazines. |
| `admin` | Everything, plus Users, Activity log and Settings. |

Permissions are defined once in `lib/auth.js` (`PERMISSIONS`) and every admin
API route asks for one, so changing what a role can do is a one-line edit.

## Security

- Passwords: scrypt with a random salt per user; never stored or logged in plain text.
- Sessions: random token in an `HttpOnly; SameSite=Strict` cookie (`Secure` in
  production). Only a SHA-256 of it is stored. Sessions end after 2 hours idle or
  12 hours total, when the account is disabled, its role changes, or its password is reset.
- CSRF: every change needs the session's token in the `X-CSRF-Token` header,
  and requests from other websites (by `Origin`) are refused.
- Sign-in: same message for unknown email and wrong password; 5 failed tries per
  account+IP and 30 per IP in 15 minutes, then a wait.
- Authorization is on the server for every `/api/admin` route. The admin panel
  hiding menu items is only for convenience.
- Safeguards: admins can't change their own role or status or delete themselves;
  the last active admin can't be demoted, disabled or deleted; deleting an account
  needs its email typed in.
- New accounts and reset passwords are temporary: the person must choose a new
  password at their next sign-in.
- The admin pages are sent with a strict Content-Security-Policy, `X-Frame-Options: DENY`
  and `noindex`. The `server/` and `tools/` folders and dotfiles are never served.
- The audit log records who did what and when, without passwords or tokens.

## API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/auth/login` | none |
| POST | `/api/auth/logout` | signed in |
| GET | `/api/auth/me` | signed in |
| POST | `/api/auth/password` | signed in (needs current password) |
| GET | `/api/admin/dashboard` | `dashboard.view` |
| GET, POST | `/api/admin/users` | `users.manage` |
| GET, PATCH, DELETE | `/api/admin/users/:id` | `users.manage` |
| POST | `/api/admin/users/:id/password` | `users.manage` |
| GET, POST | `/api/admin/videos` | `content.manage` |
| PATCH, DELETE | `/api/admin/videos/:id` | `content.manage` |
| POST | `/api/admin/videos/reorder` | `content.manage` |
| GET | `/api/admin/youtube?url=` | `content.manage` |
| GET | `/api/admin/magazines` | `content.manage` |
| PATCH | `/api/admin/magazines/:id` | `content.manage` |
| GET | `/api/admin/questions` | `questions.manage` |
| GET, PATCH, DELETE | `/api/admin/questions/:id` | `questions.manage` |
| GET | `/api/admin/audit` | `audit.view` |
| GET, PUT | `/api/admin/settings` | `settings.manage` |
| GET | `/api/public/home` | public |
| POST | `/api/public/questions` | public (rate-limited) |

## Database

Migrations are numbered `.sql` files in `migrations/`, applied in order and
recorded in `schema_migrations`. Add a change as a new file (e.g.
`003_add_x.sql`); never edit one that has already run.

- `001_init.sql`: users, sessions, audit_log, settings, questions, videos, magazines
- `002_seed_content.sql`: the reels, videos, magazines and contact details the
  homepage showed before the admin existed
