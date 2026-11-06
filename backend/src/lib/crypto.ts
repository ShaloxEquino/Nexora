import crypto from 'node:crypto';
import { KEY_ALPHABET, KEY_RANDOM_CHARS } from '@nexora/shared/plans';
import type { Plan } from '@nexora/shared/types';
import { PLANS } from '@nexora/shared/plans';

/**
 * Compute HMAC-SHA256 of a message using the LICENSE_HMAC_SECRET.
 * Returns raw Buffer (stored as bytea in Postgres).
 */
export function computeKeyHash(normalizedKey: string): Buffer {
  const secret = process.env['LICENSE_HMAC_SECRET'];
  if (!secret) throw new Error('LICENSE_HMAC_SECRET is not set');
  return crypto.createHmac('sha256', secret).update(normalizedKey).digest();
}

/**
 * Compute SHA-256 of a session token.
 * Returns raw Buffer (stored as bytea in Postgres).
 */
export function hashSessionToken(rawToken: string): Buffer {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest();
}

/**
 * Constant-time Buffer comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Generate a cryptographically random base64url token of `bytes` random bytes.
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Generate a NEXORA license key for a given plan.
 * Format: NEXORA-<PREFIX>-XXXX-XXXX-XXXX
 * Uses KEY_ALPHABET (32 chars, no confusables).
 * Returns the plaintext key string.
 */
export function generateLicenseKey(plan: Plan): string {
  const prefix = PLANS[plan].prefix;
  const randomBytes = crypto.randomBytes(KEY_RANDOM_CHARS * 2); // excess bytes for rejection sampling

  let chars = '';
  let i = 0;
  while (chars.length < KEY_RANDOM_CHARS) {
    if (i >= randomBytes.length) {
      // Need more random bytes — refill
      const extra = crypto.randomBytes(KEY_RANDOM_CHARS * 2);
      extra.copy(randomBytes);
      i = 0;
    }
    const byte = randomBytes[i++]!;
    // Rejection sampling: only use values that map evenly into 32 chars
    const maxValid = Math.floor(256 / KEY_ALPHABET.length) * KEY_ALPHABET.length;
    if (byte >= maxValid) continue;
    chars += KEY_ALPHABET[byte % KEY_ALPHABET.length]!;
  }

  const seg1 = chars.slice(0, 4);
  const seg2 = chars.slice(4, 8);
  const seg3 = chars.slice(8, 12);

  return `NEXORA-${prefix}-${seg1}-${seg2}-${seg3}`;
}

/**
 * Normalize a key for hashing: uppercase + trim.
 * Returns null for invalid format.
 */
export function normalizeKeyForHash(raw: string): string | null {
  const normalized = raw.trim().toUpperCase();
  const re = /^NEXORA-([A-Z0-9]+)-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})$/;
  if (!re.test(normalized)) return null;
  return normalized;
}

/** Convert a hex string to Buffer for parameterized bytea queries. */
export function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}
