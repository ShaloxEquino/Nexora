import { query } from '../db/pool.js';
import { revokeAllSessionsForUser } from '../lib/sessions.js';

export { revokeAllSessionsForUser };

/** Get all active sessions for a user. */
export async function getActiveSessions(
  userId: string,
  userKind: 'admin' | 'customer',
): Promise<Array<{ id: string; ip: string | null; userAgent: string | null; createdAt: Date; expiresAt: Date }>> {
  const { rows } = await query<{
    id: string;
    ip: string | null;
    user_agent: string | null;
    created_at: Date;
    expires_at: Date;
  }>(
    `SELECT id, ip, user_agent, created_at, expires_at
     FROM sessions
     WHERE user_id = $1 AND user_kind = $2 AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [userId, userKind],
  );

  return rows.map((r) => ({
    id: r.id,
    ip: r.ip,
    userAgent: r.user_agent,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}
