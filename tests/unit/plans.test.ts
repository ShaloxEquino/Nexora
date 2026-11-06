import { describe, it, expect } from '@jest/globals';
import { PLANS, computeExpiresAt, isLicenseValid } from '../../shared/src/plans.js';

describe('PLANS', () => {
  it('TRIAL is exactly 5 minutes', () => {
    expect(PLANS.TRIAL.durationMs).toBe(5 * 60 * 1000);
  });

  it('DAY is exactly 24 hours', () => {
    expect(PLANS.DAY.durationMs).toBe(24 * 60 * 60 * 1000);
  });

  it('3DAY is exactly 72 hours', () => {
    expect(PLANS['3DAY'].durationMs).toBe(72 * 60 * 60 * 1000);
  });

  it('WEEK is exactly 7 days', () => {
    expect(PLANS.WEEK.durationMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('MONTH is exactly 30 days', () => {
    expect(PLANS.MONTH.durationMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('LIFE has null durationMs', () => {
    expect(PLANS.LIFE.durationMs).toBeNull();
  });

  it('all plans have the correct prefix', () => {
    expect(PLANS.TRIAL.prefix).toBe('TRIAL');
    expect(PLANS.DAY.prefix).toBe('DAY');
    expect(PLANS['3DAY'].prefix).toBe('3DAY');
    expect(PLANS.WEEK.prefix).toBe('WEEK');
    expect(PLANS.MONTH.prefix).toBe('MONTH');
    expect(PLANS.LIFE.prefix).toBe('LIFE');
  });
});

describe('computeExpiresAt', () => {
  const now = new Date('2024-01-01T00:00:00Z');

  it('TRIAL expires 5 minutes after activation', () => {
    const expires = computeExpiresAt('TRIAL', now);
    expect(expires?.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
  });

  it('DAY expires 24 hours after activation', () => {
    const expires = computeExpiresAt('DAY', now);
    expect(expires?.getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
  });

  it('3DAY expires 72 hours after activation', () => {
    const expires = computeExpiresAt('3DAY', now);
    expect(expires?.getTime()).toBe(now.getTime() + 72 * 60 * 60 * 1000);
  });

  it('WEEK expires 7 days after activation', () => {
    const expires = computeExpiresAt('WEEK', now);
    expect(expires?.getTime()).toBe(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it('MONTH expires 30 days after activation', () => {
    const expires = computeExpiresAt('MONTH', now);
    expect(expires?.getTime()).toBe(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  });

  it('LIFE returns null', () => {
    const expires = computeExpiresAt('LIFE', now);
    expect(expires).toBeNull();
  });
});

describe('isLicenseValid', () => {
  const now = new Date('2024-06-01T00:00:00Z');

  it('returns true when expiresAt is null (LIFE)', () => {
    expect(isLicenseValid(null, now)).toBe(true);
  });

  it('returns true when expires in the future', () => {
    const future = new Date(now.getTime() + 10_000);
    expect(isLicenseValid(future, now)).toBe(true);
  });

  it('returns false when expired', () => {
    const past = new Date(now.getTime() - 1);
    expect(isLicenseValid(past, now)).toBe(false);
  });

  it('returns false when exactly at expiry', () => {
    expect(isLicenseValid(now, now)).toBe(false);
  });
});
