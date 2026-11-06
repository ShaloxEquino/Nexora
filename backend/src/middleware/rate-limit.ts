import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory per-IP rate limit buckets
const buckets = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  }
  return req.ip ?? 'unknown';
}

async function writeSecurityEvent(
  kind: string,
  ip: string,
  userAgent: string | undefined,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await query(
      `INSERT INTO security_events (kind, metadata, ip, user_agent)
       VALUES ($1, $2, $3::inet, $4)`,
      [kind, JSON.stringify(metadata), ip, userAgent ?? null],
    );
  } catch (err) {
    logger.error('Failed to write security event', { err: String(err) });
  }
}

/** Factory: creates a rate limiter middleware. */
export function createRateLimiter(opts: {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}) {
  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const ip = getClientIp(req);
    const key = `${opts.keyPrefix ?? 'rl'}:${ip}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, opts.maxRequests - bucket.count);
    const resetIn = Math.ceil((bucket.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', opts.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetIn);

    if (bucket.count > opts.maxRequests) {
      res.setHeader('Retry-After', resetIn);
      await writeSecurityEvent(
        'rate_limit_exceeded',
        ip,
        req.headers['user-agent'],
        { path: req.path, method: req.method, count: bucket.count },
      );
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          requestId: req.requestId,
        },
      });
      return;
    }

    next();
  };
}

// Periodically clean up old buckets to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.resetAt + 60_000) {
      buckets.delete(key);
    }
  }
}, 5 * 60_000);

/** Login rate limiter: 10 per 15 minutes */
export const loginRateLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 15 * 60_000,
  keyPrefix: 'login',
});

/** License API rate limiter: 60 per minute */
export const licenseRateLimiter = createRateLimiter({
  maxRequests: 60,
  windowMs: 60_000,
  keyPrefix: 'license',
});

/** Extension feature-check rate limiter: 30 per minute */
export const extensionRateLimiter = createRateLimiter({
  maxRequests: 30,
  windowMs: 60_000,
  keyPrefix: 'ext',
});
