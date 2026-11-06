import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminSession, requireOwner } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { query } from '../db/pool.js';
import { hashPassword } from '../lib/passwords.js';
import { validateBody, CreateDeveloperSchema } from '../lib/validation.js';
import { writeAuditEvent } from '../services/audit.service.js';
import { revokeAllSessionsForUser } from '../services/session.service.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// All developer management requires OWNER role
router.use(adminSession, requireOwner);

// GET /api/admin/developers
router.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rows } = await query<{
        id: string;
        email: string;
        role: string;
        permissions: string[];
        is_suspended: boolean;
        created_at: Date;
      }>(
        `SELECT id, email, role, permissions, is_suspended, created_at
         FROM admins WHERE role = 'DEVELOPER' ORDER BY created_at DESC`,
      );
      res.json({ developers: rows.map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role,
        permissions: r.permissions,
        isSuspended: r.is_suspended,
        createdAt: r.created_at,
      })) });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/admin/developers
router.post(
  '/',
  requireCsrf,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const body = validateBody(CreateDeveloperSchema, req.body);

      // Check for duplicate email
      const { rows: existing } = await query<{ id: string }>(
        'SELECT id FROM admins WHERE email = $1',
        [body.email.toLowerCase()],
      );
      if (existing[0]) throw new ConflictError('Email already in use');

      const passwordHash = await hashPassword(body.password);
      const { rows } = await query<{
        id: string;
        email: string;
        role: string;
        permissions: string[];
        is_suspended: boolean;
        created_at: Date;
      }>(
        `INSERT INTO admins (email, password_hash, role, permissions)
         VALUES ($1, $2, 'DEVELOPER', $3)
         RETURNING id, email, role, permissions, is_suspended, created_at`,
        [body.email.toLowerCase(), passwordHash, body.permissions],
      );

      const dev = rows[0]!;
      await writeAuditEvent({
        actorKind: 'admin',
        actorId: authReq.admin.id,
        action: 'developer.create',
        targetKind: 'admin',
        targetId: dev.id,
        metadata: { email: dev.email, permissions: body.permissions },
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });

      res.status(201).json({
        developer: {
          id: dev.id,
          email: dev.email,
          role: dev.role,
          permissions: dev.permissions,
          isSuspended: dev.is_suspended,
          createdAt: dev.created_at,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/admin/developers/:id/suspend
router.post(
  '/:id/suspend',
  requireCsrf,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };

      const { rowCount } = await query(
        `UPDATE admins SET is_suspended = TRUE WHERE id = $1 AND role = 'DEVELOPER'`,
        [id],
      );
      if (!rowCount || rowCount === 0) throw new NotFoundError('Developer not found');

      await revokeAllSessionsForUser(id, 'admin');
      await writeAuditEvent({
        actorKind: 'admin',
        actorId: authReq.admin.id,
        action: 'developer.suspend',
        targetKind: 'admin',
        targetId: id,
        metadata: {},
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/admin/developers/:id/revoke-sessions
router.post(
  '/:id/revoke-sessions',
  requireCsrf,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };

      const { rows: check } = await query<{ id: string }>(
        `SELECT id FROM admins WHERE id = $1 AND role = 'DEVELOPER'`,
        [id],
      );
      if (!check[0]) throw new NotFoundError('Developer not found');

      const count = await revokeAllSessionsForUser(id, 'admin');
      await writeAuditEvent({
        actorKind: 'admin',
        actorId: authReq.admin.id,
        action: 'developer.revoke_sessions',
        targetKind: 'admin',
        targetId: id,
        metadata: { sessionsRevoked: count },
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });

      res.json({ ok: true, sessionsRevoked: count });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
