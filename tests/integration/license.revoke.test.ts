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
let adminCookie: string;
let csrfToken: string;

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
  const email = `revoke-${crypto.randomUUID()}@example.com`;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO admins (email, password_hash, role) VALUES ($1, $2, 'OWNER') RETURNING id`,
    [email, hash],
  );
  adminId = rows[0]!.id;

  // Login
  const loginRes = await request.post('/api/admin/auth/login').send({ email, password: 'TestPassword123!' });
  const setCookie = loginRes.headers['set-cookie'];
  adminCookie = Array.isArray(setCookie) ? setCookie[0]!.split(';')[0]! : '';
  csrfToken = loginRes.body.csrfToken;
});

afterAll(async () => {
  if (client) {
    if (adminId) await client.query('DELETE FROM admins WHERE id = $1', [adminId]);
    await client.end();
  }
});

async function createAndActivateLicense(): Promise<{ key: string; id: string; deviceId: string }> {
  const key = generateLicenseKey('WEEK');
  const normalized = normalizeKeyForHash(key)!;
  const keyHash = computeKeyHash(normalized);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO licenses (plan, key_hash, device_limit, created_by)
     VALUES ('WEEK', $1, 2, $2) RETURNING id`,
    [keyHash, adminId],
  );
  const id = rows[0]!.id;
  const deviceId = 'dev-' + crypto.randomUUID();
  await request.post('/api/license/activate').send({ key, deviceId }).expect(200);
  return { key, id, deviceId };
}

describe('License revoke → restore', () => {
  it('revoked license returns 409 on activation', async () => {
    if (!client) return;
    const { key, id } = await createAndActivateLicense();

    // Revoke via admin API
    await request
      .post(`/api/admin/licenses/${id}/revoke`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ reason: 'Test revoke' })
      .expect(200);

    // Try to activate on new device
    const res = await request
      .post('/api/license/activate')
      .send({ key, deviceId: 'new-device-' + crypto.randomUUID() })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('restored license is valid again', async () => {
    if (!client) return;
    const { key, id } = await createAndActivateLicense();

    // Revoke
    await request
      .post(`/api/admin/licenses/${id}/revoke`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    // Restore
    await request
      .post(`/api/admin/licenses/${id}/restore`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    // Activate on new device — should succeed
    await request
      .post('/api/license/activate')
      .send({ key, deviceId: 'restored-device-' + crypto.randomUUID() })
      .expect(200);
  });
});
