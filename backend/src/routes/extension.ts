import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { extensionRateLimiter } from '../middleware/rate-limit.js';
import { checkFeatureAccess } from '../services/license.service.js';
import { validateBody, FeatureCheckSchema } from '../lib/validation.js';
import { ForbiddenError } from '../lib/errors.js';

const router = Router();

router.use(extensionRateLimiter);

// POST /api/extension/feature-check
router.post(
  '/feature-check',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validateBody(FeatureCheckSchema, req.body);
      const result = await checkFeatureAccess({
        key: body.key,
        deviceId: body.deviceId,
        feature: body.feature,
      });

      if (!result.allowed) {
        next(new ForbiddenError('Feature not available on your plan'));
        return;
      }

      res.json({
        allowed: true,
        plan: result.plan,
        expiresAt: result.expiresAt ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
