import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL =
  process.env['DATABASE_URL_TEST'] ?? process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  logger.error('DATABASE_URL is not set');
  process.exit(1);
}

async function migrate(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Bootstrap the migrations table if it doesn't exist yet
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const filename of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM _migrations WHERE filename = $1',
        [filename],
      );
      if ((rows.length ?? 0) > 0) {
        logger.info(`Migration already applied: ${filename}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      logger.info(`Applying migration: ${filename}`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [filename],
        );
        await client.query('COMMIT');
        logger.info(`Migration applied: ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Migration failed: ${filename}`, { err: String(err) });
        throw err;
      }
    }

    logger.info('All migrations complete.');
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  logger.error('Migration runner failed', { err: String(err) });
  process.exit(1);
});
