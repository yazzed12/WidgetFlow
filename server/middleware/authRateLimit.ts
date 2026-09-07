import type { RequestHandler } from 'express';

type Bucket = { count: number; resetsAt: number };
const buckets = new Map<string, Bucket>();

export function createAuthRateLimit(name: string, limit: number, windowMs: number): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetsAt <= now) {
      bucket = { count: 0, resetsAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Please try again later.' } });
      return;
    }
    next();
  };
}

export function clearAuthRateLimitsForTests() { buckets.clear(); }
