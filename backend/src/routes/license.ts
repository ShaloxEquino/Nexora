import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { licenseRateLimiter } from '../middleware/rate-limit.js';
import {
  activateLicense,
  getLicenseStatus,
  deactivateDevice,
} from '../services/license.service.js';
import {
  validateBody,
  validateQuery,
  ActivateSchema,
  LicenseStatusQuerySchema,
  DeactivateSchema,
} from '../lib/validation.js';

const router = Router();

router.use(licenseRateLimiter);

// POST /api/license/activate
router.post(
  '/activate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validateBody(ActivateSchema, req.body);
      const result = await activateLicense({
        ...body,
        ip: req.ip ?? undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/license/status
router.get(
  '/status',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = validateQuery(LicenseStatusQuerySchema, req.query);
      const result = await getLicenseStatus(params);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/license/deactivate
router.post(
  '/deactivate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validateBody(DeactivateSchema, req.body);
      await deactivateDevice(body);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
