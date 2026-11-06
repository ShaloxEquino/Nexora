import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminSession, requirePermission } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import {
  bulkGenerateLicenses,
  listLicenses,
  revokeLicense,
  restoreLicense,
  getLicenseActivations,
} from '../services/license.service.js';
import { validateBody, validateQuery, BulkGenerateSchema, RevokeSchema, LicenseListQuerySchema } from '../lib/validation.js';
import { writeAuditEvent } from '../services/audit.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/admin/licenses
router.get(
  '/',
  adminSession,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = validateQuery(LicenseListQuerySchema, req.query);
      const result = await listLicenses(params);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/admin/licenses/bulk
router.post(
  '/bulk',
  adminSession,
  requireCsrf,
  requirePermission('licenses.write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const body = validateBody(BulkGenerateSchema, req.body);

      const { keys, licenseIds } = await bulkGenerateLicenses({
        ...body,
        createdBy: authReq.admin.id,
      });

      await writeAuditEvent({
        actorKind: 'admin',
        actorId: authReq.admin.id,
        action: 'license.bulk_generate',
        targetKind: 'license',
        metadata: { plan: body.plan, count: body.count, deviceLimit: body.deviceLimit },
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });

      res.json({
        keys,
        licenseIds,
        warning:
          'These license keys are shown exactly once and are not stored in plaintext. Copy them now.',
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/admin/licenses/:id/revoke
router.post(
  '/:id/revoke',
  adminSession,
  requireCsrf,
  requirePermission('licenses.write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const body = validateBody(RevokeSchema, req.body);

      await revokeLicense(id, body.reason);

      await writeAuditEvent({
        actorKind: 'admin',
        actorId: authReq.admin.id,
        action: 'license.revoke',
        targetKind: 'license',
        targetId: id,
        metadata: { reason: body.reason ?? null },
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/admin/licenses/:id/restore
router.post(
  '/:id/restore',
  adminSession,
  requireCsrf,
  requirePermission('licenses.write'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };

      await restoreLicense(id);

      await writeAuditEvent({
        actorKind: 'admin',
        actorId: authReq.admin.id,
        action: 'license.restore',
        targetKind: 'license',
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

// GET /api/admin/licenses/:id/activations
router.get(
  '/:id/activations',
  adminSession,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const activations = await getLicenseActivations(id);
      res.json({ activations });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
