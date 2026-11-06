import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

async function writeSecurityEvent(
  ip: string,
  userAgent: string | undefined,
  sessionId: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO security_events (kind, metadata, ip, user_agent)
       VALUES ('invalid_csrf', $1, $2::inet, $3)`,
      [JSON.stringify({ sessionId }), ip, userAgent ?? null],
    );
  } catch (err) {
    logger.error('Failed to write CSRF security event', { err: String(err) });
  }
}

/**
 * CSRF middleware: validates the X-CSRF-Token header against the session's
 * stored csrf_token.
 *
 * Must be used AFTER the adminSession middleware which attaches req.session.
 */
export async function requireCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const session = (req as Request & { session?: { id: string; csrfToken: string } }).session;
  if (!session) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'No session', requestId: req.requestId },
    });
    return;
  }

  const headerToken = req.headers['x-csrf-token'];
  if (typeof headerToken !== 'string' || headerToken !== session.csrfToken) {
    await writeSecurityEvent(
      req.ip ?? 'unknown',
      req.headers['user-agent'],
      session.id,
    );
    next(new ForbiddenError('Invalid or missing CSRF token'));
    return;
  }

  next();
}
