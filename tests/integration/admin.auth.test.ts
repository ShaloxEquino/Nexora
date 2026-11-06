import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';
import crypto from 'node:crypto';

process.env['LICENSE_HMAC_SECRET'] = 'integration-test-hmac-secret-at-least-32-chars';
process.env['SESSION_SECRET'] = 'integration-test-session-secret-at-least-32-chars';
process.env['ADMIN_ORIGIN'] = 'http://localhost:3000';
process.env['EXTENSION_ORIGIN'] = 'chrome-extension://test';
process.env['NODE_ENV'] = 'test';

let client: pg.Client;
let adminEmail: string;
let adminId: string;

const { default: supertest } = await import('supertest');
const { default: app } = await import('../../backend/src/app.js');
const { hashPassword } = await import('../../backend/src/lib/passwords.js');

const request = supertest(app);

beforeAll(async () => {
  const dbUrl = process.env['DATABASE_URL_TEST'];
  if (!dbUrl) return;
  client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  adminEmail = `auth-test-${crypto.randomUUID()}@example.com`;
  const hash = await hashPassword('SecurePassword123!');
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO admins (email, password_hash, role) VALUES ($1, $2, 'OWNER') RETURNING id`,
    [adminEmail, hash],
  );
  adminId = rows[0]!.id;
});

afterAll(async () => {
  if (client) {
    if (adminId) await client.query('DELETE FROM admins WHERE id = $1', [adminId]);
    await client.end();
  }
});

describe('Admin auth', () => {
  it('login sets a session cookie', async () => {
    if (!client) return;
    const res = await request
      .post('/api/admin/auth/login')
      .send({ email: adminEmail, password: 'SecurePassword123!' })
      .expect(200);

    expect(res.body.user.email).toBe(adminEmail);
    expect(res.body.csrfToken).toBeDefined();

    const cookies = res.headers['set-cookie'];
    const hasCookie = Array.isArray(cookies)
      ? cookies.some((c: string) => c.includes('nexora_session'))
      : typeof cookies === 'string' && cookies.includes('nexora_session');
    expect(hasCookie).toBe(true);
  });

  it('returns 401 for bad password', async () => {
    if (!client) return;
    const res = await request
      .post('/api/admin/auth/login')
      .send({ email: adminEmail, password: 'wrongpassword' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for unknown email', async () => {
    if (!client) return;
    await request
      .post('/api/admin/auth/login')
      .send({ email: 'nobody@example.com', password: 'password' })
      .expect(401);
  });

  it('CSRF required for logout', async () => {
    if (!client) return;
    const loginRes = await request
      .post('/api/admin/auth/login')
      .send({ email: adminEmail, password: 'SecurePassword123!' })
      .expect(200);

    const cookies = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(cookies) ? cookies[0]!.split(';')[0]! : '';

    // Missing CSRF token
    await request
      .post('/api/admin/auth/logout')
      .set('Cookie', cookieStr)
      .expect(403);
  });

  it('logout revokes the session', async () => {
    if (!client) return;
    const loginRes = await request
      .post('/api/admin/auth/login')
      .send({ email: adminEmail, password: 'SecurePassword123!' })
      .expect(200);

    const cookies = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(cookies) ? cookies[0]!.split(';')[0]! : '';
    const { csrfToken } = loginRes.body as { csrfToken: string };

    await request
      .post('/api/admin/auth/logout')
      .set('Cookie', cookieStr)
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    // Subsequent /me should fail
    await request
      .get('/api/admin/auth/me')
      .set('Cookie', cookieStr)
      .expect(401);
  });
});
