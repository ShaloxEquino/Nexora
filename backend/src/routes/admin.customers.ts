import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminSession, requirePermission } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { listCustomers, banCustomer, unbanCustomer } from '../services/customer.service.js';
import { validateQuery, CustomerQuerySchema } from '../lib/validation.js';
import { writeAuditEvent } from '../services/audit.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

router.get(
  '/',
  adminSession,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = validateQuery(CustomerQuerySchema, req.query);
      const result = await listCustomers(params);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/ban',
  adminSession,
  requireCsrf,
  requirePermission('customers.write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const customer = await banCustomer(id);

      await writeAuditEvent({
        actorKind: 'admin',
        actorId: authReq.admin.id,
        action: 'customer.ban',
        targetKind: 'customer',
        targetId: id,
        metadata: {},
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });

      res.json({ customer });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/unban',
  adminSession,
  requireCsrf,
  requirePermission('customers.write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const customer = await unbanCustomer(id);

      await writeAuditEvent({
        actorKind: 'admin',
        actorId: authReq.admin.id,
        action: 'customer.unban',
        targetKind: 'customer',
        targetId: id,
        metadata: {},
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });

      res.json({ customer });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
