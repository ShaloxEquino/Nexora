import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import type { ActorKind, TargetKind } from '@nexora/shared/types';

export interface AuditEventParams {
  actorKind: ActorKind;
  actorId: string | null;
  action: string;
  targetKind?: TargetKind;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/** Write an audit event. Never throws — log errors silently. */
export async function writeAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_events (actor_kind, actor_id, action, target_kind, target_id, metadata, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8)`,
      [
        params.actorKind,
        params.actorId ?? null,
        params.action,
        params.targetKind ?? null,
        params.targetId ?? null,
        JSON.stringify(params.metadata ?? {}),
        params.ip ?? null,
        params.userAgent ?? null,
      ],
    );
  } catch (err) {
    logger.error('Failed to write audit event', {
      action: params.action,
      err: String(err),
    });
  }
}

/** Write a security event. Never throws. */
export async function writeSecurityEvent(params: {
  kind: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO security_events (kind, metadata, ip, user_agent)
       VALUES ($1, $2, $3::inet, $4)`,
      [
        params.kind,
        JSON.stringify(params.metadata ?? {}),
        params.ip ?? null,
        params.userAgent ?? null,
      ],
    );
  } catch (err) {
    logger.error('Failed to write security event', {
      kind: params.kind,
      err: String(err),
    });
  }
}
