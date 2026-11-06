import { pool, withSerializableTransaction, query } from '../db/pool.js';
import type pg from 'pg';
import {
  generateLicenseKey,
  computeKeyHash,
  normalizeKeyForHash,
} from '../lib/crypto.js';
import { computeExpiresAt, PLANS } from '../lib/plans.js';
import { isFeatureAllowed } from '../lib/plans.js';
import type { Plan, LicenseStatus } from '@nexora/shared/types';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  AppError,
} from '../lib/errors.js';

export interface LicenseRow {
  id: string;
  plan: Plan;
  status: LicenseStatus;
  device_limit: number;
  activation_policy: string;
  activation_started_at: Date | null;
  activation_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  revoked_reason: string | null;
  suspended_at: Date | null;
  created_by: string;
  customer_id: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Generate `count` license keys for the given plan and persist them. */
export async function bulkGenerateLicenses(params: {
  plan: Plan;
  count: number;
  deviceLimit: number;
  activationPolicy: 'on_first_use' | 'immediate' | 'scheduled';
  activationAt?: string;
  notes?: string;
  createdBy: string;
}): Promise<{ keys: string[]; licenseIds: string[] }> {
  const keys: string[] = [];
  const licenseIds: string[] = [];

  // Generate keys in batches to avoid huge transactions
  const BATCH_SIZE = 500;
  let remaining = params.count;

  while (remaining > 0) {
    const batchCount = Math.min(remaining, BATCH_SIZE);
    remaining -= batchCount;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < batchCount; i++) {
        let key: string;
        let keyHash: Buffer;
        let attempts = 0;

        // Retry on hash collision (astronomically rare but correct to handle)
        while (true) {
          key = generateLicenseKey(params.plan);
          const normalized = normalizeKeyForHash(key)!;
          keyHash = computeKeyHash(normalized);

          const collision = await client.query(
            'SELECT 1 FROM licenses WHERE key_hash = $1',
            [keyHash],
          );
          if (collision.rowCount === 0) break;
          if (++attempts > 10) throw new AppError('Key generation collision loop', 500);
        }

        const activationAt = params.activationAt ? new Date(params.activationAt) : null;

        let expiresAt: Date | null = null;
        let activationStartedAt: Date | null = null;

        if (params.activationPolicy === 'immediate') {
          activationStartedAt = new Date();
          expiresAt = computeExpiresAt(params.plan, activationStartedAt);
        } else if (params.activationPolicy === 'scheduled' && activationAt) {
          activationStartedAt = activationAt;
          expiresAt = computeExpiresAt(params.plan, activationAt);
        }
        // on_first_use: both remain null until first activation

        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO licenses
             (plan, key_hash, status, device_limit, activation_policy,
              activation_started_at, activation_at, expires_at, created_by, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [
            params.plan,
            keyHash,
            params.activationPolicy === 'immediate' ? 'active' : 'unused',
            params.deviceLimit,
            params.activationPolicy,
            activationStartedAt,
            activationAt,
            expiresAt,
            params.createdBy,
            params.notes ?? null,
          ],
        );

        keys.push(key!);
        licenseIds.push(rows[0]!.id);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return { keys, licenseIds };
}

/** Activate a license for a device. Runs inside SERIALIZABLE transaction. */
export async function activateLicense(params: {
  key: string;
  deviceId: string;
  fingerprint?: string;
  userAgent?: string;
  ip?: string;
}): Promise<{
  licenseId: string;
  plan: Plan;
  status: 'active';
  expiresAt: Date | null;
  deviceLimit: number;
  activationId: string;
  reactivated: boolean;
}> {
  const normalized = normalizeKeyForHash(params.key);
  if (!normalized) throw new NotFoundError('License key not found');
  const keyHash = computeKeyHash(normalized);

  return withSerializableTransaction(async (client) => {
    // Lock the license row
    const { rows: licRows } = await client.query<LicenseRow>(
      `SELECT id, plan, status, device_limit, activation_policy,
              activation_started_at, activation_at, expires_at,
              revoked_at, suspended_at, customer_id
       FROM licenses WHERE key_hash = $1 FOR UPDATE`,
      [keyHash],
    );

    const license = licRows[0];
    if (!license) throw new NotFoundError('License key not found');

    // Check revocation and suspension before anything else
    if (license.revoked_at) {
      throw new ConflictError('This license has been revoked');
    }
    if (license.suspended_at) {
      throw new ConflictError('This license is suspended');
    }

    // Determine if this device has been here before
    const { rows: devRows } = await client.query<{
      id: string;
      deactivated_at: Date | null;
    }>(
      'SELECT id, deactivated_at FROM devices WHERE license_id = $1 AND device_id = $2',
      [license.id, params.deviceId],
    );
    const existingDevice = devRows[0];

    if (existingDevice && !existingDevice.deactivated_at) {
      // Idempotent re-activation: just refresh last_seen_at
      await client.query(
        'UPDATE devices SET last_seen_at = NOW(), user_agent = $1, ip = $2::inet WHERE id = $3',
        [params.userAgent ?? null, params.ip ?? null, existingDevice.id],
      );
      // Also update license status if somehow stale
      const nowDate = new Date();
      const isExpired =
        license.expires_at !== null && license.expires_at <= nowDate;
      if (!isExpired) {
        await client.query(
          `UPDATE licenses SET status = 'active' WHERE id = $1 AND status = 'unused'`,
          [license.id],
        );
      }
      return {
        licenseId: license.id,
        plan: license.plan,
        status: 'active',
        expiresAt: license.expires_at,
        deviceLimit: license.device_limit,
        activationId: existingDevice.id,
        reactivated: true,
      };
    }

    // Count active (non-deactivated) devices
    const { rows: countRows } = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM devices WHERE license_id = $1 AND deactivated_at IS NULL`,
      [license.id],
    );
    const activeDeviceCount = parseInt(countRows[0]?.cnt ?? '0', 10);

    if (existingDevice && existingDevice.deactivated_at) {
      // Reactivating a previously deactivated device — does NOT consume a new slot
    } else {
      // Brand-new device — check limit
      if (activeDeviceCount >= license.device_limit) {
        throw new ConflictError(
          `Device limit reached (${license.device_limit}/${license.device_limit})`,
        );
      }
    }

    // Compute expiry based on activation policy
    let activationStartedAt = license.activation_started_at;
    let expiresAt = license.expires_at;

    const now = new Date();

    if (license.activation_policy === 'on_first_use') {
      // Start the clock only on first activation
      if (!activationStartedAt) {
        activationStartedAt = now;
        expiresAt = computeExpiresAt(license.plan, now);
      }
    } else if (license.activation_policy === 'scheduled') {
      // Use the pre-set activation_started_at
      if (license.activation_at && now < license.activation_at) {
        throw new ConflictError('License is not yet active (scheduled start in the future)');
      }
      // expiresAt already set at generation time
    }
    // immediate: expiresAt set at generation time already

    // Check expiry
    if (expiresAt !== null && expiresAt <= now) {
      throw new ConflictError('This license has expired');
    }

    // Upsert device
    let activationId: string;
    if (existingDevice) {
      // Reactivate deactivated device
      await client.query(
        `UPDATE devices SET deactivated_at = NULL, last_seen_at = NOW(),
                           user_agent = $1, ip = $2::inet
         WHERE id = $3`,
        [params.userAgent ?? null, params.ip ?? null, existingDevice.id],
      );
      activationId = existingDevice.id;
    } else {
      const { rows: newDevRows } = await client.query<{ id: string }>(
        `INSERT INTO devices (license_id, device_id, fingerprint, user_agent, ip)
         VALUES ($1, $2, $3, $4, $5::inet)
         RETURNING id`,
        [
          license.id,
          params.deviceId,
          params.fingerprint ?? null,
          params.userAgent ?? null,
          params.ip ?? null,
        ],
      );
      activationId = newDevRows[0]!.id;
    }

    // Update license
    await client.query(
      `UPDATE licenses
       SET status = 'active',
           activation_started_at = COALESCE(activation_started_at, $1),
           expires_at = COALESCE(expires_at, $2)
       WHERE id = $3`,
      [activationStartedAt, expiresAt, license.id],
    );

    return {
      licenseId: license.id,
      plan: license.plan,
      status: 'active',
      expiresAt,
      deviceLimit: license.device_limit,
      activationId,
      reactivated: !!existingDevice,
    };
  });
}

/** Get license status for the extension. */
export async function getLicenseStatus(params: {
  key: string;
  deviceId: string;
}): Promise<{
  valid: boolean;
  plan?: Plan;
  status?: LicenseStatus;
  expiresAt?: Date | null;
  deviceLimit?: number;
  reason?: string;
}> {
  const normalized = normalizeKeyForHash(params.key);
  if (!normalized) {
    return { valid: false, reason: 'Invalid key format' };
  }
  const keyHash = computeKeyHash(normalized);

  const { rows } = await query<LicenseRow>(
    `SELECT id, plan, status, device_limit, expires_at, revoked_at, suspended_at
     FROM licenses WHERE key_hash = $1`,
    [keyHash],
  );
  const license = rows[0];
  if (!license) return { valid: false, reason: 'License not found' };

  if (license.revoked_at) {
    return { valid: false, plan: license.plan, status: 'revoked', reason: 'License revoked' };
  }
  if (license.suspended_at) {
    return { valid: false, plan: license.plan, status: 'suspended', reason: 'License suspended' };
  }

  const now = new Date();
  if (license.expires_at !== null && license.expires_at <= now) {
    // Mark as expired if not already
    await query(
      `UPDATE licenses SET status = 'expired' WHERE id = $1 AND status != 'expired'`,
      [license.id],
    );
    return { valid: false, plan: license.plan, status: 'expired', reason: 'License expired' };
  }

  // Verify device is known
  const { rows: devRows } = await query<{ id: string }>(
    'SELECT id FROM devices WHERE license_id = $1 AND device_id = $2 AND deactivated_at IS NULL',
    [license.id, params.deviceId],
  );
  if (!devRows[0]) {
    return {
      valid: false,
      plan: license.plan,
      status: license.status,
      reason: 'Device not activated',
    };
  }

  // Refresh last_seen_at
  await query(
    'UPDATE devices SET last_seen_at = NOW() WHERE license_id = $1 AND device_id = $2',
    [license.id, params.deviceId],
  );

  return {
    valid: true,
    plan: license.plan,
    status: 'active',
    expiresAt: license.expires_at,
    deviceLimit: license.device_limit,
  };
}

/** Deactivate a device. */
export async function deactivateDevice(params: {
  key: string;
  deviceId: string;
}): Promise<void> {
  const normalized = normalizeKeyForHash(params.key);
  if (!normalized) throw new NotFoundError('License key not found');
  const keyHash = computeKeyHash(normalized);

  const { rows: licRows } = await query<{ id: string }>(
    'SELECT id FROM licenses WHERE key_hash = $1',
    [keyHash],
  );
  const license = licRows[0];
  if (!license) throw new NotFoundError('License key not found');

  const { rowCount } = await query(
    `UPDATE devices SET deactivated_at = NOW()
     WHERE license_id = $1 AND device_id = $2 AND deactivated_at IS NULL`,
    [license.id, params.deviceId],
  );

  if (!rowCount || rowCount === 0) {
    throw new NotFoundError('Device not found or already deactivated');
  }
}

/** Revoke a license. */
export async function revokeLicense(id: string, reason?: string): Promise<void> {
  const { rowCount } = await query(
    `UPDATE licenses SET status = 'revoked', revoked_at = NOW(), revoked_reason = $1
     WHERE id = $2 AND status != 'revoked'`,
    [reason ?? null, id],
  );
  if (!rowCount || rowCount === 0) throw new NotFoundError('License not found or already revoked');
}

/** Restore a revoked license. */
export async function restoreLicense(id: string): Promise<void> {
  const { rows } = await query<{ expires_at: Date | null; plan: string }>(
    'SELECT expires_at, plan FROM licenses WHERE id = $1',
    [id],
  );
  const license = rows[0];
  if (!license) throw new NotFoundError('License not found');

  const now = new Date();
  let newStatus: LicenseStatus;
  if (license.expires_at === null) {
    newStatus = 'active'; // LIFE
  } else if (license.expires_at > now) {
    newStatus = 'active';
  } else {
    newStatus = 'expired';
  }

  await query(
    `UPDATE licenses SET status = $1, revoked_at = NULL, revoked_reason = NULL WHERE id = $2`,
    [newStatus, id],
  );
}

/** Get all devices for a license. */
export async function getLicenseActivations(
  licenseId: string,
): Promise<Array<{
  id: string;
  deviceId: string;
  ip: string | null;
  userAgent: string | null;
  activatedAt: Date;
  lastSeenAt: Date;
  deactivatedAt: Date | null;
}>> {
  const { rows } = await query<{
    id: string;
    device_id: string;
    ip: string | null;
    user_agent: string | null;
    activated_at: Date;
    last_seen_at: Date;
    deactivated_at: Date | null;
  }>(
    `SELECT id, device_id, ip, user_agent, activated_at, last_seen_at, deactivated_at
     FROM devices WHERE license_id = $1 ORDER BY activated_at DESC`,
    [licenseId],
  );

  return rows.map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    ip: r.ip,
    userAgent: r.user_agent,
    activatedAt: r.activated_at,
    lastSeenAt: r.last_seen_at,
    deactivatedAt: r.deactivated_at,
  }));
}

/** List licenses with optional filters. */
export async function listLicenses(params: {
  q?: string;
  status?: LicenseStatus;
  plan?: Plan;
  limit: number;
  offset: number;
}): Promise<{ licenses: LicenseRow[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.status) {
    conditions.push(`status = $${idx++}`);
    values.push(params.status);
  }
  if (params.plan) {
    conditions.push(`plan = $${idx++}`);
    values.push(params.plan);
  }
  if (params.q) {
    conditions.push(`(notes ILIKE $${idx++} OR id::text = $${idx++})`);
    values.push(`%${params.q}%`, params.q);
    idx++; // bump since we used two params
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countValues = [...values];
  const { rows: countRows } = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM licenses ${where}`,
    countValues,
  );
  const total = parseInt(countRows[0]?.count ?? '0', 10);

  values.push(params.limit, params.offset);
  const { rows } = await query<LicenseRow>(
    `SELECT id, plan, status, device_limit, activation_policy,
            activation_started_at, activation_at, expires_at,
            revoked_at, revoked_reason, suspended_at,
            created_by, customer_id, notes, created_at, updated_at
     FROM licenses ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    values,
  );

  return { licenses: rows, total };
}

/** Get overview statistics. */
export async function getLicenseOverview(): Promise<{
  total: number;
  active: number;
  expired: number;
  revoked: number;
  unused: number;
  suspended: number;
}> {
  const { rows } = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) as count FROM licenses GROUP BY status`,
  );

  const stats = { total: 0, active: 0, expired: 0, revoked: 0, unused: 0, suspended: 0 };
  for (const row of rows) {
    const count = parseInt(row.count, 10);
    stats.total += count;
    if (row.status in stats) {
      (stats as Record<string, number>)[row.status] = count;
    }
  }
  return stats;
}

/** Check if a feature is allowed for a key+device. */
export async function checkFeatureAccess(params: {
  key: string;
  deviceId: string;
  feature: string;
}): Promise<{ allowed: boolean; plan?: Plan; expiresAt?: Date | null }> {
  const status = await getLicenseStatus(params);
  if (!status.valid || !status.plan) {
    return { allowed: false };
  }
  const allowed = isFeatureAllowed(status.plan, params.feature);
  return { allowed, plan: status.plan, expiresAt: status.expiresAt };
}
