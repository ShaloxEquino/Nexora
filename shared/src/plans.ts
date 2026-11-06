// ============================================================
// NEXORA Plan Definitions
// ============================================================

import type { Plan, PlanConfig } from './types.js';

export const PLANS: Record<Plan, PlanConfig> = {
  TRIAL: { label: 'Trial', durationMs: 5 * 60_000, prefix: 'TRIAL' },
  DAY: { label: 'Daily', durationMs: 24 * 60 * 60_000, prefix: 'DAY' },
  '3DAY': { label: '3-Day', durationMs: 72 * 60 * 60_000, prefix: '3DAY' },
  WEEK: { label: 'Weekly', durationMs: 7 * 24 * 60 * 60_000, prefix: 'WEEK' },
  MONTH: { label: 'Monthly', durationMs: 30 * 24 * 60 * 60_000, prefix: 'MONTH' },
  LIFE: { label: 'Lifetime', durationMs: null, prefix: 'LIFE' },
};

/**
 * Compute expiry date from activation time.
 * Returns null for LIFE plan (never expires).
 */
export function computeExpiresAt(plan: Plan, activatedAt: Date): Date | null {
  const config = PLANS[plan];
  if (config.durationMs === null) return null;
  return new Date(activatedAt.getTime() + config.durationMs);
}

/**
 * Returns true if the license is still valid at the given time.
 * LIFE licenses never expire.
 */
export function isLicenseValid(
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (expiresAt === null) return true;
  return expiresAt > now;
}

/** Key alphabet: 32 chars, no confusable characters */
export const KEY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Total random chars in a key (4+4+4 groups) */
export const KEY_RANDOM_CHARS = 12;

/**
 * Build key string from plan prefix and random segment array.
 * Format: NEXORA-<PREFIX>-XXXX-XXXX-XXXX
 */
export function buildKeyString(prefix: string, segments: [string, string, string]): string {
  return `NEXORA-${prefix}-${segments[0]}-${segments[1]}-${segments[2]}`;
}

/**
 * Parse and normalize a key string (uppercase, trim).
 * Returns null if the format is invalid.
 */
export function normalizeKey(raw: string): string | null {
  const normalized = raw.trim().toUpperCase();
  // Must match NEXORA-<PREFIX>-XXXX-XXXX-XXXX where XXXX are KEY_ALPHABET chars
  const re = /^NEXORA-([A-Z0-9]+)-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})$/;
  if (!re.test(normalized)) return null;
  return normalized;
}

/** Detect which plan a key belongs to by its prefix */
export function detectPlanFromKey(key: string): Plan | null {
  const parts = key.split('-');
  // parts[0]=NEXORA, parts[1]=PREFIX, parts[2..4]=segments
  if (parts.length < 5) return null;
  const prefix = parts.slice(1, parts.length - 3).join('-');
  for (const [plan, config] of Object.entries(PLANS) as [Plan, PlanConfig][]) {
    if (config.prefix === prefix) return plan;
  }
  return null;
}

export type { Plan, PlanConfig };
