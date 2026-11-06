import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../logger.js';
import { config } from '../config.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? 'unknown';

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Application error', {
        requestId,
        code: err.code,
        message: err.message,
        stack: err.stack,
      });
      res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: config.NODE_ENV === 'production' ? 'An internal error occurred' : err.message,
          requestId,
        },
      });
    } else {
      res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.message,
          requestId,
        },
      });
    }
    return;
  }

  // Unknown error — hide details in production
  const errMessage = err instanceof Error ? err.message : String(err);
  const errStack = err instanceof Error ? err.stack : undefined;

  logger.error('Unhandled error', {
    requestId,
    message: errMessage,
    stack: errStack,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message:
        config.NODE_ENV === 'production'
          ? 'An internal error occurred'
          : errMessage,
      requestId,
    },
  });
}
