/**
 * bootstrap-owner.ts
 *
 * Creates the first OWNER admin account.
 * Refuses to run if any OWNER already exists.
 * Reads email and password from environment variables or interactive prompt.
 * Never uses a hardcoded default password.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import pg from 'pg';
import { hashPassword } from '../lib/passwords.js';
import { logger } from '../logger.js';

const DATABASE_URL =
  process.env['DATABASE_URL_TEST'] ?? process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  logger.error('DATABASE_URL is not set');
  process.exit(1);
}

async function bootstrap(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM admins WHERE role = 'OWNER'`,
    );

    if (parseInt(rows[0]?.count ?? '0', 10) > 0) {
      logger.error('An OWNER account already exists. Refusing to create another.');
      process.exit(1);
    }

    let email = process.env['BOOTSTRAP_EMAIL'] ?? '';
    let password = process.env['BOOTSTRAP_PASSWORD'] ?? '';

    if (!email || !password) {
      const rl = createInterface({ input, output });
      try {
        if (!email) {
          email = await rl.question('Owner email: ');
        }
        if (!password) {
          password = await rl.question('Owner password (min 12 chars): ');
        }
      } finally {
        rl.close();
      }
    }

    email = email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      logger.error('Invalid email address');
      process.exit(1);
    }

    if (password.length < 12) {
      logger.error('Password must be at least 12 characters');
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);

    const { rows: inserted } = await client.query<{ id: string; email: string }>(
      `INSERT INTO admins (email, password_hash, role, permissions)
       VALUES ($1, $2, 'OWNER', '{}')
       RETURNING id, email`,
      [email, passwordHash],
    );

    logger.info('Owner account created successfully', {
      id: inserted[0]!.id,
      email: inserted[0]!.email,
    });
  } finally {
    await client.end();
  }
}

bootstrap().catch((err) => {
  logger.error('Bootstrap failed', { err: String(err) });
  process.exit(1);
});
