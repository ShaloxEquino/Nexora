import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/pool.js';
import { verifyPassword } from '../lib/passwords.js';
import { createSession, revokeSession } from '../lib/sessions.js';
import { validateBody } from '../lib/validation.js';
import { AdminLoginSchema } from '../lib/validation.js';
import { adminSession } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { loginRateLimiter } from '../middleware/rate-limit.js';
import { writeAuditEvent, writeSecurityEvent } from '../services/audit.service.js';
import { UnauthorizedError } from '../lib/errors.js';
import { config } from '../config.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// POST /api/admin/auth/login
router.post(
  '/login',
  loginRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validateBody(AdminLoginSchema, req.body);

      const { rows } = await query<{
        id: string;
        email: string;
        password_hash: string;
        role: string;
        permissions: string[];
        is_suspended: boolean;
      }>(
        `SELECT id, email, password_hash, role, permissions, is_suspended
         FROM admins WHERE email = $1`,
        [body.email.toLowerCase()],
      );

      const admin = rows[0];
      const ip = req.ip ?? null;
      const ua = req.headers['user-agent'] ?? null;

      // Always run verifyPassword to prevent timing attacks
      const dummyHash =
        'scrypt$32768$8$1$0000000000000000000000000000000000000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
      const valid = await verifyPassword(
        body.password,
        admin?.password_hash ?? dummyHash,
      );

      if (!admin || !valid) {
        await writeSecurityEvent({
          kind: 'failed_login',
          metadata: { email: body.email },
          ip,
          userAgent: ua,
        });
        next(new UnauthorizedError('Invalid email or password'));
        return;
      }

      if (admin.is_suspended) {
        next(new UnauthorizedError('Account is suspended'));
        return;
      }

      const { rawToken, csrfToken } = await createSession(admin.id, 'admin', ip, ua);

      await writeAuditEvent({
        actorKind: 'admin',
        actorId: admin.id,
        action: 'admin.login',
        metadata: {},
        ip,
        userAgent: ua,
      });

      res.cookie('nexora_session', rawToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      });

      res.json({
        user: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
        },
        csrfToken,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/auth/me
router.get(
  '/me',
  adminSession,
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authReq = req as AuthenticatedRequest;
      res.json({
        user: {
          id: authReq.admin.id,
          email: authReq.admin.email,
          role: authReq.admin.role,
          permissions: authReq.admin.permissions,
          isSuspended: authReq.admin.isSuspended,
        },
        csrfToken: authReq.session.csrfToken,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/admin/auth/logout
router.post(
  '/logout',
  adminSession,
  requireCsrf,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      await revokeSession(authReq.session.id);

      await writeAuditEvent({
        actorKind: 'admin',
        actorId: authReq.admin.id,
        action: 'admin.logout',
        metadata: {},
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });

      res.clearCookie('nexora_session', { path: '/' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
