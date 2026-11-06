import { describe, it, expect } from '@jest/globals';

// Set required env for crypto module
process.env['LICENSE_HMAC_SECRET'] = 'test-hmac-secret-at-least-32-chars-long-xxxx';

import {
  generateLicenseKey,
  computeKeyHash,
  normalizeKeyForHash,
  timingSafeEqual,
} from '../../backend/src/lib/crypto.js';
import { KEY_ALPHABET } from '../../shared/src/plans.js';

const ALL_PLANS = ['TRIAL', 'DAY', '3DAY', 'WEEK', 'MONTH', 'LIFE'] as const;

describe('generateLicenseKey', () => {
  it('produces correct format for every plan', () => {
    for (const plan of ALL_PLANS) {
      const key = generateLicenseKey(plan);
      expect(key).toMatch(
        /^NEXORA-[A-Z0-9]+-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/,
      );
    }
  });

  it('only uses characters from KEY_ALPHABET in the random segments', () => {
    for (const plan of ALL_PLANS) {
      const key = generateLicenseKey(plan);
      const segments = key.split('-').slice(-3).join('');
      for (const char of segments) {
        expect(KEY_ALPHABET).toContain(char);
      }
    }
  });

  it('does not produce collisions in 10000 samples for TRIAL plan', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const key = generateLicenseKey('TRIAL');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(10_000);
  });

  it('TRIAL keys have TRIAL prefix', () => {
    for (let i = 0; i < 10; i++) {
      const key = generateLicenseKey('TRIAL');
      expect(key.startsWith('NEXORA-TRIAL-')).toBe(true);
    }
  });

  it('LIFE keys have LIFE prefix', () => {
    const key = generateLicenseKey('LIFE');
    expect(key.startsWith('NEXORA-LIFE-')).toBe(true);
  });
});

describe('computeKeyHash', () => {
  it('returns a 32-byte Buffer', () => {
    const hash = computeKeyHash('NEXORA-TRIAL-2222-3333-4444');
    expect(hash).toBeInstanceOf(Buffer);
    expect(hash.byteLength).toBe(32);
  });

  it('is deterministic for the same input', () => {
    const key = 'NEXORA-TRIAL-2222-3333-4444';
    const h1 = computeKeyHash(key);
    const h2 = computeKeyHash(key);
    expect(h1.equals(h2)).toBe(true);
  });

  it('produces different hashes for different inputs', () => {
    const h1 = computeKeyHash('NEXORA-TRIAL-2222-3333-4444');
    const h2 = computeKeyHash('NEXORA-TRIAL-2222-3333-4445');
    expect(h1.equals(h2)).toBe(false);
  });
});

describe('normalizeKeyForHash', () => {
  it('normalizes valid keys', () => {
    const result = normalizeKeyForHash('nexora-trial-2222-3333-4444');
    expect(result).toBe('NEXORA-TRIAL-2222-3333-4444');
  });

  it('returns null for invalid keys', () => {
    expect(normalizeKeyForHash('INVALID')).toBeNull();
    expect(normalizeKeyForHash('NEXORA-TRIAL-222-3333-4444')).toBeNull(); // too short segment
    expect(normalizeKeyForHash('')).toBeNull();
  });

  it('trims whitespace', () => {
    const result = normalizeKeyForHash('  NEXORA-TRIAL-2222-3333-4444  ');
    expect(result).toBe('NEXORA-TRIAL-2222-3333-4444');
  });
});

describe('timingSafeEqual', () => {
  it('returns true for equal buffers', () => {
    const a = Buffer.from('hello');
    const b = Buffer.from('hello');
    expect(timingSafeEqual(a, b)).toBe(true);
  });

  it('returns false for different buffers of same length', () => {
    const a = Buffer.from('hello');
    const b = Buffer.from('world');
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  it('returns false for buffers of different lengths', () => {
    const a = Buffer.from('hello');
    const b = Buffer.from('hell');
    expect(timingSafeEqual(a, b)).toBe(false);
  });
});
