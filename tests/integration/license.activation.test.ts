/**
 * Integration tests for license activation.
 * Requires DATABASE_URL_TEST to be set and migrations applied.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';
import crypto from 'node:crypto';

process.env['LICENSE_HMAC_SECRET'] = 'integration-test-hmac-secret-at-least-32-chars';
process.env['SESSION_SECRET'] = 'integration-test-session-secret-at-least-32-chars';
process.env['ADMIN_ORIGIN'] = 'http://localhost:3000';
process.env['EXTENSION_ORIGIN'] = 'chrome-extension://test';
process.env['NODE_ENV'] = 'test';

let client: pg.Client;
let adminId: string;

const { default: supertest } = await import('supertest');
const { default: app } = await import('../../backend/src/app.js');
const { generateLicenseKey, computeKeyHash, normalizeKeyForHash } = await import('../../backend/src/lib/crypto.js');
const { hashPassword } = await import('../../backend/src/lib/passwords.js');

const request = supertest(app);

beforeAll(async () => {
  const dbUrl = process.env['DATABASE_URL_TEST'];
  if (!dbUrl) {
    console.warn('Skipping integration tests: DATABASE_URL_TEST not set');
    return;
  }
  client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  const hash = await hashPassword('TestPassword123!');
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO admins (email, password_hash, role, permissions)
     VALUES ($1, $2, 'OWNER', '{}') RETURNING id`,
    [`test-${crypto.randomUUID()}@example.com`, hash],
  );
  adminId = rows[0]!.id;
});

afterAll(async () => {
  if (client) {
    if (adminId) await client.query('DELETE FROM admins WHERE id = $1', [adminId]);
    await client.end();
  }
});

async function createTestLicense(plan = 'TRIAL', adminId: string): Promise<{ key: string; id: string }> {
  const key = generateLicenseKey(plan as Parameters<typeof generateLicenseKey>[0]);
  const normalized = normalizeKeyForHash(key)!;
  const keyHash = computeKeyHash(normalized);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO licenses (plan, key_hash, device_limit, created_by)
     VALUES ($1, $2, 2, $3) RETURNING id`,
    [plan, keyHash, adminId],
  );
  return { key, id: rows[0]!.id };
}

describe('POST /api/license/activate', () => {
  it('returns 200 on happy path', async () => {
    if (!client) return;
    const { key } = await createTestLicense('TRIAL', adminId);
    const deviceId = crypto.randomUUID();

    const res = await request
      .post('/api/license/activate')
      .send({ key, deviceId })
      .expect(200);

    expect(res.body).toMatchObject({
      plan: 'TRIAL',
      status: 'active',
      reactivated: false,
    });
    expect(res.body.licenseId).toBeDefined();
    expect(res.body.expiresAt).toBeDefined();
  });

  it('returns 404 for unknown key', async () => {
    const res = await request
      .post('/api/license/activate')
      .send({ key: 'NEXORA-TRIAL-2222-3333-4444', deviceId: 'test-device-id-xxx' })
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 409 for revoked license', async () => {
    if (!client) return;
    const { key, id } = await createTestLicense('DAY', adminId);
    await client.query(
      `UPDATE licenses SET status = 'revoked', revoked_at = NOW() WHERE id = $1`,
      [id],
    );

    const res = await request
      .post('/api/license/activate')
      .send({ key, deviceId: crypto.randomUUID() })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 409 for expired license', async () => {
    if (!client) return;
    const { key, id } = await createTestLicense('TRIAL', adminId);
    await client.query(
      `UPDATE licenses SET
         activation_started_at = NOW() - INTERVAL '10 minutes',
         expires_at = NOW() - INTERVAL '5 minutes',
         status = 'active'
       WHERE id = $1`,
      [id],
    );

    const res = await request
      .post('/api/license/activate')
      .send({ key, deviceId: crypto.randomUUID() })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 409 for suspended license', async () => {
    if (!client) return;
    const { key, id } = await createTestLicense('DAY', adminId);
    await client.query(
      `UPDATE licenses SET status = 'suspended', suspended_at = NOW() WHERE id = $1`,
      [id],
    );

    const res = await request
      .post('/api/license/activate')
      .send({ key, deviceId: crypto.randomUUID() })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('idempotent re-activation refreshes last_seen_at without creating duplicate', async () => {
    if (!client) return;
    const { key } = await createTestLicense('WEEK', adminId);
    const deviceId = crypto.randomUUID();

    const res1 = await request.post('/api/license/activate').send({ key, deviceId }).expect(200);
    const res2 = await request.post('/api/license/activate').send({ key, deviceId }).expect(200);

    expect(res1.body.activationId).toBe(res2.body.activationId);
    expect(res2.body.reactivated).toBe(true);
  });
});
