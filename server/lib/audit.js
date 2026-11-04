// Audit log of administrative actions. Secrets are never recorded: any meta key
// that looks like a password/token is dropped before saving.

const SECRET_KEY = /pass|token|secret|hash|csrf|cookie/i;

function scrub(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEY.test(k)) continue;
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? scrub(v) : v;
  }
  return out;
}

function record(db, ctx, action, { targetType = null, targetId = null, meta = null, actor = ctx.user } = {}) {
  db.prepare(`INSERT INTO audit_log (actor_id, actor_email, action, target_type, target_id, meta, ip)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(actor ? actor.id : null, actor ? actor.email : null, action, targetType,
      targetId === null ? null : String(targetId), meta ? JSON.stringify(scrub(meta)) : null, ctx.ip || null);
}

module.exports = { record, scrub };
