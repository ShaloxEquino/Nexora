import type { Request, Response } from 'express';
import { Router } from 'express';
import { dbHealthCheck } from '../db/pool.js';

const router = Router();

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const dbOk = await dbHealthCheck();
  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    db: dbOk,
    ts: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

export default router;
