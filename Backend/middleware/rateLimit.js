const buckets = new Map();

function now() {
  return Date.now();
}

export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 300,
  keyFn = (req) => req.ip || 'unknown'
} = {}) {
  return (req, res, next) => {
    const key = `${keyFn(req)}:${req.path}`;
    const current = now();
    const entry = buckets.get(key);

    if (!entry || entry.expiresAt <= current) {
      buckets.set(key, { count: 1, expiresAt: current + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.expiresAt - current) / 1000);
      res.set('Retry-After', String(Math.max(retryAfter, 1)));
      return res.status(429).json({ error: 'Too many requests. Please retry shortly.' });
    }

    return next();
  };
}

