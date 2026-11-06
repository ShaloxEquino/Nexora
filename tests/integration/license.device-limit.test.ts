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
  if (!dbUrl) return;
  client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  const hash = await hashPassword('TestPassword123!');
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO admins (email, password_hash, role) VALUES ($1, $2, 'OWNER') RETURNING id`,
    [`devlimit-${crypto.randomUUID()}@example.com`, hash],
  );
  adminId = rows[0]!.id;
});

afterAll(async () => {
  if (client) {
    if (adminId) await client.query('DELETE FROM admins WHERE id = $1', [adminId]);
    await client.end();
  }
});

async function createTestLicense(deviceLimit: number): Promise<string> {
  const key = generateLicenseKey('MONTH');
  const normalized = normalizeKeyForHash(key)!;
  const keyHash = computeKeyHash(normalized);
  await client.query(
    `INSERT INTO licenses (plan, key_hash, device_limit, created_by)
     VALUES ('MONTH', $1, $2, $3)`,
    [keyHash, deviceLimit, adminId],
  );
  return key;
}

describe('Device limit enforcement', () => {
  it('allows activation up to device limit, then refuses', async () => {
    if (!client) return;
    const key = await createTestLicense(2);

    // Activate device 1
    await request.post('/api/license/activate').send({ key, deviceId: 'dev-1-' + crypto.randomUUID() }).expect(200);

    // Activate device 2
    await request.post('/api/license/activate').send({ key, deviceId: 'dev-2-' + crypto.randomUUID() }).expect(200);

    // Activate device 3 — must be refused
    const res = await request
      .post('/api/license/activate')
      .send({ key, deviceId: 'dev-3-' + crypto.randomUUID() })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toContain('limit');
  });

  it('reactivating a deactivated device does not consume a new slot', async () => {
    if (!client) return;
    const key = await createTestLicense(1);
    const deviceId = 'dev-A-' + crypto.randomUUID();

    // Activate
    await request.post('/api/license/activate').send({ key, deviceId }).expect(200);

    // Deactivate
    await request.post('/api/license/deactivate').send({ key, deviceId }).expect(200);

    // Reactivate — must succeed (slot freed)
    const res = await request.post('/api/license/activate').send({ key, deviceId }).expect(200);
    expect(res.body.reactivated).toBe(true);
  });
});
