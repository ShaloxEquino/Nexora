import 'node:process';
import app from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool } from './db/pool.js';
import { pruneExpiredSessions } from './lib/sessions.js';

const server = app.listen(config.PORT, () => {
  logger.info('NEXORA backend started', { port: config.PORT, env: config.NODE_ENV });
});

// Periodic session cleanup every hour
const sessionPruneInterval = setInterval(
  () => {
    pruneExpiredSessions().catch((err) =>
      logger.error('Session prune failed', { err: String(err) }),
    );
  },
  60 * 60_000,
);

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully`);

  clearInterval(sessionPruneInterval);

  server.close(async () => {
    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error('Error closing pool', { err: String(err) });
    }
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
