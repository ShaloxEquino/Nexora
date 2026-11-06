import { z } from 'zod';
import type { Plan } from '@nexora/shared/types';
import { KEY_ALPHABET } from '@nexora/shared/plans';

export const PlanEnum = z.enum(['TRIAL', 'DAY', '3DAY', 'WEEK', 'MONTH', 'LIFE']);

export const LicenseKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (val) =>
      /^NEXORA-([A-Z0-9]+)-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})$/.test(val),
    { message: 'Invalid license key format' },
  );

export const DeviceIdSchema = z
  .string()
  .min(8, 'deviceId must be at least 8 characters')
  .max(128, 'deviceId must not exceed 128 characters');

export const AdminLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const CreateDeveloperSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters'),
  permissions: z
    .array(z.string())
    .default([]),
});

export const BulkGenerateSchema = z.object({
  plan: PlanEnum,
  count: z
    .number()
    .int()
    .min(1, 'count must be at least 1')
    .max(5000, 'count must not exceed 5000'),
  deviceLimit: z
    .number()
    .int()
    .min(1, 'deviceLimit must be at least 1')
    .max(10, 'deviceLimit must not exceed 10'),
  activationPolicy: z.enum(['on_first_use', 'immediate', 'scheduled']),
  activationAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(1000).optional(),
});

export const ActivateSchema = z.object({
  key: LicenseKeySchema,
  deviceId: DeviceIdSchema,
  deviceFingerprint: z.string().max(256).optional(),
  userAgent: z.string().max(512).optional(),
});

export const LicenseStatusQuerySchema = z.object({
  key: LicenseKeySchema,
  deviceId: DeviceIdSchema,
});

export const DeactivateSchema = z.object({
  key: LicenseKeySchema,
  deviceId: DeviceIdSchema,
});

export const FeatureCheckSchema = z.object({
  key: LicenseKeySchema,
  deviceId: DeviceIdSchema,
  feature: z.string().min(1).max(64),
});

export const RevokeSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const BanSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const CustomerQuerySchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const LicenseListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: z
    .enum(['unused', 'active', 'expired', 'revoked', 'suspended'])
    .optional(),
  plan: PlanEnum.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Validate request body with zod; throw 400 AppError on failure. */
export function validateBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const messages = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw Object.assign(new Error(messages), { statusCode: 400, code: 'VALIDATION_ERROR' });
  }
  return result.data;
}

/** Validate query params with zod; throw 400 AppError on failure. */
export function validateQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  return validateBody(schema, query);
}
