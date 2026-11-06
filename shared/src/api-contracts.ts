// ============================================================
// NEXORA API Contracts (shared between backend & extension)
// ============================================================

import type { Plan, LicenseStatus } from './types.js';

// ---- License / Extension API ----

export interface ActivateRequest {
  key: string;
  deviceId: string;
  deviceFingerprint?: string;
  userAgent?: string;
}

export interface ActivateResponse {
  licenseId: string;
  plan: Plan;
  status: 'active';
  expiresAt: string | null; // ISO 8601 or null for LIFE
  deviceLimit: number;
  activationId: string;
  reactivated: boolean;
}

export interface LicenseStatusQuery {
  key: string;
  deviceId: string;
}

export interface LicenseStatusResponse {
  valid: boolean;
  plan?: Plan;
  status?: LicenseStatus;
  expiresAt?: string | null;
  deviceLimit?: number;
  reason?: string;
}

export interface DeactivateRequest {
  key: string;
  deviceId: string;
}

export interface FeatureCheckRequest {
  key: string;
  deviceId: string;
  feature: string;
}

export interface FeatureCheckResponse {
  allowed: boolean;
  plan?: Plan;
  expiresAt?: string | null;
}

// ---- Admin Auth API ----

export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface AdminLoginResponse {
  user: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
  };
  csrfToken: string;
}

export interface AdminMeResponse {
  user: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
    isSuspended: boolean;
  };
  csrfToken: string;
}

// ---- Admin Licenses API ----

export interface BulkGenerateRequest {
  plan: Plan;
  count: number; // 1-5000
  deviceLimit: number; // 1-10
  activationPolicy: 'on_first_use' | 'immediate' | 'scheduled';
  activationAt?: string; // ISO 8601, only for scheduled
  notes?: string;
}

export interface BulkGenerateResponse {
  keys: string[];
  licenseIds: string[];
  warning: string;
}

export interface RevokeRequest {
  reason?: string;
}

// ---- Admin Overview API ----

export interface OverviewResponse {
  licenses: {
    total: number;
    active: number;
    expired: number;
    revoked: number;
    unused: number;
    suspended: number;
  };
  customers: {
    total: number;
    banned: number;
  };
  developers: {
    total: number;
    suspended: number;
  };
  recentAudit: Array<{
    id: string;
    action: string;
    actorKind: string;
    actorId: string | null;
    createdAt: string;
  }>;
  health: {
    db: boolean;
    uptime: number;
  };
}

// ---- Admin Developers API ----

export interface CreateDeveloperRequest {
  email: string;
  password: string;
  permissions: string[];
}

// ---- Generic error shape ----

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
