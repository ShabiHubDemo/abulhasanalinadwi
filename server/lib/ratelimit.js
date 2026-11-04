// In-memory sliding-window rate limiter (single server process).
// For several processes behind a load balancer, move this to a shared store.

function createLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> timestamps

  function prune(key, t) {
    const list = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  }

  return {
    // seconds until the key may try again, or 0 if allowed
    retryAfter(key) {
      const t = Date.now();
      const list = prune(key, t);
      return list.length >= max ? Math.ceil((windowMs - (t - list[0])) / 1000) : 0;
    },
    hit(key) {
      const t = Date.now();
      const list = prune(key, t);
      list.push(t);
      hits.set(key, list);
    },
    reset(key) { hits.delete(key); },
  };
}

module.exports = { createLimiter };
