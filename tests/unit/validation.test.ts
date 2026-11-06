import { describe, it, expect } from '@jest/globals';
import {
  AdminLoginSchema,
  BulkGenerateSchema,
  ActivateSchema,
  LicenseKeySchema,
  CreateDeveloperSchema,
} from '../../backend/src/lib/validation.js';

describe('AdminLoginSchema', () => {
  it('accepts valid credentials', () => {
    const result = AdminLoginSchema.safeParse({
      email: 'admin@example.com',
      password: 'secret',
    });
    expect(result.success).toBe(true);
  });

  it('rejects bad email', () => {
    const result = AdminLoginSchema.safeParse({
      email: 'not-an-email',
      password: 'secret',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing password', () => {
    const result = AdminLoginSchema.safeParse({
      email: 'admin@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateDeveloperSchema', () => {
  it('accepts valid developer data', () => {
    const result = CreateDeveloperSchema.safeParse({
      email: 'dev@example.com',
      password: 'SecureP@ssword123',
      permissions: ['licenses.write'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = CreateDeveloperSchema.safeParse({
      email: 'dev@example.com',
      password: 'short',
      permissions: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain('12');
    }
  });
});

describe('BulkGenerateSchema', () => {
  const valid = {
    plan: 'TRIAL' as const,
    count: 10,
    deviceLimit: 2,
    activationPolicy: 'on_first_use' as const,
  };

  it('accepts valid bulk generate request', () => {
    const result = BulkGenerateSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects count > 5000', () => {
    const result = BulkGenerateSchema.safeParse({ ...valid, count: 5001 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.some((e) => e.message.includes('5000'))).toBe(true);
    }
  });

  it('rejects count < 1', () => {
    const result = BulkGenerateSchema.safeParse({ ...valid, count: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects deviceLimit > 10', () => {
    const result = BulkGenerateSchema.safeParse({ ...valid, deviceLimit: 11 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.some((e) => e.message.includes('10'))).toBe(true);
    }
  });

  it('rejects invalid plan', () => {
    const result = BulkGenerateSchema.safeParse({ ...valid, plan: 'INVALID' });
    expect(result.success).toBe(false);
  });
});

describe('LicenseKeySchema', () => {
  it('accepts valid key', () => {
    const result = LicenseKeySchema.safeParse('NEXORA-TRIAL-2222-3333-4444');
    expect(result.success).toBe(true);
  });

  it('accepts key with lowercase (normalizes to uppercase)', () => {
    const result = LicenseKeySchema.safeParse('nexora-trial-2222-3333-4444');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('NEXORA-TRIAL-2222-3333-4444');
    }
  });

  it('rejects malformed key — too short', () => {
    const result = LicenseKeySchema.safeParse('NEXORA-TRIAL-222-3333-4444');
    expect(result.success).toBe(false);
  });

  it('rejects key with confusable chars (0, 1, I, O, L)', () => {
    const result = LicenseKeySchema.safeParse('NEXORA-TRIAL-0000-1111-IIOO');
    expect(result.success).toBe(false);
  });

  it('rejects completely invalid string', () => {
    const result = LicenseKeySchema.safeParse('not-a-key');
    expect(result.success).toBe(false);
  });
});

describe('ActivateSchema', () => {
  it('accepts valid activation request', () => {
    const result = ActivateSchema.safeParse({
      key: 'NEXORA-TRIAL-2222-3333-4444',
      deviceId: 'device-abc-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing deviceId', () => {
    const result = ActivateSchema.safeParse({
      key: 'NEXORA-TRIAL-2222-3333-4444',
    });
    expect(result.success).toBe(false);
  });

  it('rejects too-short deviceId', () => {
    const result = ActivateSchema.safeParse({
      key: 'NEXORA-TRIAL-2222-3333-4444',
      deviceId: 'abc',
    });
    expect(result.success).toBe(false);
  });
});
