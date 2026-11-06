import type { Request, Response, NextFunction } from 'express';
import { getSession } from '../lib/sessions.js';
import { query } from '../db/pool.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import type { Admin } from '@nexora/shared/types';

export interface AuthenticatedRequest extends Request {
  session: {
    id: string;
    userId: string;
    userKind: 'admin' | 'customer';
    csrfToken: string;
  };
  admin: Admin;
}

/**
 * Middleware: validate the admin session cookie.
 * Attaches req.session and req.admin.
 */
export async function adminSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawToken = (req as { cookies?: Record<string, string> }).cookies?.['nexora_session'];
  if (!rawToken) {
    next(new UnauthorizedError('No session cookie'));
    return;
  }

  const session = await getSession(rawToken);
  if (!session || session.userKind !== 'admin') {
    next(new UnauthorizedError('Invalid or expired session'));
    return;
  }

  // Load admin from DB to pick up latest suspension status
  const { rows } = await query<{
    id: string;
    email: string;
    role: string;
    permissions: string[];
    is_suspended: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, email, role, permissions, is_suspended, created_at, updated_at
     FROM admins WHERE id = $1`,
    [session.userId],
  );

  const admin = rows[0];
  if (!admin) {
    next(new UnauthorizedError('Admin account not found'));
    return;
  }

  if (admin.is_suspended) {
    next(new ForbiddenError('Admin account is suspended'));
    return;
  }

  (req as AuthenticatedRequest).session = {
    id: session.id,
    userId: session.userId,
    userKind: session.userKind,
    csrfToken: session.csrfToken,
  };
  (req as AuthenticatedRequest).admin = {
    id: admin.id,
    email: admin.email,
    role: admin.role as 'OWNER' | 'DEVELOPER',
    permissions: admin.permissions,
    isSuspended: admin.is_suspended,
    createdAt: admin.created_at,
    updatedAt: admin.updated_at,
  };

  next();
}

/** Middleware factory: require a specific permission or OWNER role. */
export function requirePermission(permission: string) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    const admin = (req as AuthenticatedRequest).admin;
    if (!admin) {
      next(new UnauthorizedError('Not authenticated'));
      return;
    }
    if (admin.role === 'OWNER') {
      next();
      return;
    }
    if (!admin.permissions.includes(permission)) {
      next(new ForbiddenError(`Missing permission: ${permission}`));
      return;
    }
    next();
  };
}

/** Middleware: require OWNER role. */
export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  const admin = (req as AuthenticatedRequest).admin;
  if (!admin || admin.role !== 'OWNER') {
    next(new ForbiddenError('OWNER role required'));
    return;
  }
  next();
}
