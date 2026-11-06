import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';

process.env['LICENSE_HMAC_SECRET'] = 'integration-test-hmac-secret-at-least-32-chars';
process.env['SESSION_SECRET'] = 'integration-test-session-secret-at-least-32-chars';
process.env['ADMIN_ORIGIN'] = 'http://localhost:3000';
process.env['EXTENSION_ORIGIN'] = 'chrome-extension://test';
process.env['NODE_ENV'] = 'test';

let client: pg.Client;

const { default: supertest } = await import('supertest');
const { default: app } = await import('../../backend/src/app.js');

const request = supertest(app);

beforeAll(async () => {
  const dbUrl = process.env['DATABASE_URL_TEST'];
  if (!dbUrl) return;
  client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
});

afterAll(async () => {
  if (client) await client.end();
});

describe('Login rate limiting', () => {
  it('returns 429 on the 11th login attempt within the window', async () => {
    if (!client) return;
    const testIp = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    let last429 = false;
    for (let i = 0; i < 11; i++) {
      const res = await request
        .post('/api/admin/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({ email: 'noone@example.com', password: 'doesnotmatter' });

      if (res.status === 429) {
        last429 = true;
        break;
      }
    }
    expect(last429).toBe(true);
  });

  it('writes a security_events row on rate-limit trip', async () => {
    if (!client) return;
    const testIp = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    for (let i = 0; i < 11; i++) {
      await request
        .post('/api/admin/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({ email: 'nobody@example.com', password: 'wrong' });
    }

    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM security_events WHERE kind = 'rate_limit_exceeded' AND ip = $1::inet ORDER BY created_at DESC LIMIT 1`,
      [testIp],
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});
