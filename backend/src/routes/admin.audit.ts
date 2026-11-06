import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminSession, requirePermission } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { z } from 'zod';
import { validateQuery } from '../lib/validation.js';

const router = Router();

const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get(
  '/',
  adminSession,
  requirePermission('audit.read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = validateQuery(AuditQuerySchema, req.query);

      const { rows: auditRows } = await query<{
        id: string;
        actor_kind: string;
        actor_id: string | null;
        action: string;
        target_kind: string | null;
        target_id: string | null;
        metadata: Record<string, unknown>;
        ip: string | null;
        user_agent: string | null;
        created_at: Date;
      }>(
        `SELECT id, actor_kind, actor_id, action, target_kind, target_id,
                metadata, ip, user_agent, created_at
         FROM audit_events
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [params.limit, params.offset],
      );

      const { rows: secRows } = await query<{
        id: string;
        kind: string;
        metadata: Record<string, unknown>;
        ip: string | null;
        user_agent: string | null;
        created_at: Date;
      }>(
        `SELECT id, kind, metadata, ip, user_agent, created_at
         FROM security_events
         ORDER BY created_at DESC
         LIMIT $1`,
        [params.limit],
      );

      res.json({
        audit: auditRows.map((r) => ({
          id: String(r.id),
          actorKind: r.actor_kind,
          actorId: r.actor_id,
          action: r.action,
          targetKind: r.target_kind,
          targetId: r.target_id,
          metadata: r.metadata,
          ip: r.ip,
          userAgent: r.user_agent,
          createdAt: r.created_at,
        })),
        security: secRows.map((r) => ({
          id: String(r.id),
          kind: r.kind,
          metadata: r.metadata,
          ip: r.ip,
          userAgent: r.user_agent,
          createdAt: r.created_at,
        })),
        total: auditRows.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
