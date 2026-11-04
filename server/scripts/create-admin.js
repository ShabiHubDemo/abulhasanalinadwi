// Creates the first administrator, or promotes an existing account.
//
//   npm run create-admin -- --email you@example.org --name "Your Name"
//   npm run create-admin -- --email existing@example.org --promote
//
// The password is typed at a hidden prompt (or, for automated setups, read
// from the ADMIN_PASSWORD environment variable). Nothing is hard-coded.

const readline = require('readline');
const config = require('../config');
const { open, migrate } = require('../db');
const auth = require('../lib/auth');

function args() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const key = a[i].slice(2);
    out[key] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
  return out;
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); }; // don't echo the password
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

function audit(db, action, user, meta) {
  db.prepare(`INSERT INTO audit_log (actor_id, actor_email, action, target_type, target_id, meta, ip)
              VALUES (NULL, 'cli', ?, 'user', ?, ?, 'local')`).run(action, String(user.id), JSON.stringify(meta));
}

async function main() {
  const o = args();
  const email = String(o.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    console.error('Usage: npm run create-admin -- --email you@example.org --name "Your Name"   (or --promote)');
    process.exit(1);
  }
  const db = open(config.databaseFile);
  migrate(db);
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (o.promote) {
    if (!existing) { console.error(`No account with the email ${email}.`); process.exit(1); }
    db.prepare(`UPDATE users SET role = 'admin', status = 'active', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(existing.id);
    audit(db, 'user.role_changed', existing, { email, role: { from: existing.role, to: 'admin' }, via: 'cli' });
    console.log(`${email} is now an administrator.`);
    return;
  }
  if (existing) {
    console.error(`An account with ${email} already exists. Use --promote to make it an administrator.`);
    process.exit(1);
  }

  const name = String(o.name || '').trim() || email.split('@')[0];
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) { console.error('Run this in a terminal, or set ADMIN_PASSWORD.'); process.exit(1); }
    password = await askHidden('Password for the new administrator: ');
    const again = await askHidden('Type it again: ');
    if (password !== again) { console.error('The passwords didn’t match.'); process.exit(1); }
  }
  const problem = auth.passwordProblem(password, { email, name });
  if (problem) { console.error(problem); process.exit(1); }

  const hash = await auth.hashPassword(password);
  const info = db.prepare(`INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')`).run(email, name, hash);
  audit(db, 'user.created', { id: info.lastInsertRowid }, { email, role: 'admin', via: 'cli' });
  console.log(`Administrator ${email} created. Sign in at /admin/login`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
