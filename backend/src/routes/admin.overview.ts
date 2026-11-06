import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminSession } from '../middleware/auth.js';
import { getLicenseOverview } from '../services/license.service.js';
import { query, dbHealthCheck } from '../db/pool.js';

const router = Router();

router.get(
  '/',
  adminSession,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [licenseStats, dbOk] = await Promise.all([
        getLicenseOverview(),
        dbHealthCheck(),
      ]);

      const { rows: customerRows } = await query<{ total: string; banned: string }>(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_banned) as banned FROM customers`,
      );

      const { rows: devRows } = await query<{ total: string; suspended: string }>(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_suspended) as suspended
         FROM admins WHERE role = 'DEVELOPER'`,
      );

      const { rows: auditRows } = await query<{
        id: string;
        action: string;
        actor_kind: string;
        actor_id: string | null;
        created_at: Date;
      }>(
        `SELECT id, action, actor_kind, actor_id, created_at
         FROM audit_events ORDER BY created_at DESC LIMIT 10`,
      );

      res.json({
        licenses: licenseStats,
        customers: {
          total: parseInt(customerRows[0]?.total ?? '0', 10),
          banned: parseInt(customerRows[0]?.banned ?? '0', 10),
        },
        developers: {
          total: parseInt(devRows[0]?.total ?? '0', 10),
          suspended: parseInt(devRows[0]?.suspended ?? '0', 10),
        },
        recentAudit: auditRows.map((r) => ({
          id: String(r.id),
          action: r.action,
          actorKind: r.actor_kind,
          actorId: r.actor_id,
          createdAt: r.created_at,
        })),
        health: {
          db: dbOk,
          uptime: Math.floor(process.uptime()),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
