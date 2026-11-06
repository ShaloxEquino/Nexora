import { query } from '../db/pool.js';
import { generateSecureToken, hashSessionToken } from './crypto.js';
import { generateSecureToken as _gen } from './crypto.js';
import crypto from 'node:crypto';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface SessionPayload {
  id: string;
  userId: string;
  userKind: 'admin' | 'customer';
  csrfToken: string;
}

/** Create a new session in the DB and return the raw cookie token. */
export async function createSession(
  userId: string,
  userKind: 'admin' | 'customer',
  ip: string | null,
  userAgent: string | null,
): Promise<{ rawToken: string; csrfToken: string; sessionId: string }> {
  const rawToken = generateSecureToken(32);
  const tokenHash = hashSessionToken(rawToken);
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const { rows } = await query<{ id: string }>(
    `INSERT INTO sessions (user_kind, user_id, token_hash, csrf_token, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::inet, $7)
     RETURNING id`,
    [userKind, userId, tokenHash, csrfToken, userAgent, ip, expiresAt],
  );

  return { rawToken, csrfToken, sessionId: rows[0]!.id };
}

/** Look up and validate a session by its raw cookie token. */
export async function getSession(
  rawToken: string,
): Promise<SessionPayload | null> {
  const tokenHash = hashSessionToken(rawToken);
  const { rows } = await query<{
    id: string;
    user_id: string;
    user_kind: 'admin' | 'customer';
    csrf_token: string;
    expires_at: Date;
    revoked_at: Date | null;
  }>(
    `SELECT id, user_id, user_kind, csrf_token, expires_at, revoked_at
     FROM sessions
     WHERE token_hash = $1`,
    [tokenHash],
  );

  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at) <= new Date()) return null;

  return {
    id: row.id,
    userId: row.user_id,
    userKind: row.user_kind,
    csrfToken: row.csrf_token,
  };
}

/** Revoke a specific session. */
export async function revokeSession(sessionId: string): Promise<void> {
  await query(
    'UPDATE sessions SET revoked_at = NOW() WHERE id = $1',
    [sessionId],
  );
}

/** Revoke all sessions for a given user. */
export async function revokeAllSessionsForUser(
  userId: string,
  userKind: 'admin' | 'customer',
): Promise<number> {
  const { rowCount } = await query(
    `UPDATE sessions SET revoked_at = NOW()
     WHERE user_id = $1 AND user_kind = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
    [userId, userKind],
  );
  return rowCount ?? 0;
}

/** Clean up expired/revoked sessions (run periodically). */
export async function pruneExpiredSessions(): Promise<void> {
  await query(
    `DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL '1 day'`,
  );
}
