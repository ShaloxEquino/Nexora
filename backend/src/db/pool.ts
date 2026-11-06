import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../logger.js';

const { Pool } = pg;

const DATABASE_URL =
  process.env['DATABASE_URL_TEST'] ?? process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  logger.error('DATABASE_URL is not set');
  process.exit(1);
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl:
    config.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : undefined,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { err: String(err) });
});

/** Run a single parameterized query. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, values);
}

/** Acquire a client for a serializable transaction. */
export async function withSerializableTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Check if the database is reachable. */
export async function dbHealthCheck(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
