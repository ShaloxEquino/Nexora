// ============================================================
// NEXORA Shared Types
// ============================================================

export type Plan = 'TRIAL' | 'DAY' | '3DAY' | 'WEEK' | 'MONTH' | 'LIFE';

export type LicenseStatus =
  | 'unused'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'suspended';

export type AdminRole = 'OWNER' | 'DEVELOPER';

export type ActivationPolicy = 'on_first_use' | 'immediate' | 'scheduled';

export type UserKind = 'admin' | 'customer';

export type ActorKind = 'admin' | 'customer' | 'system';

export type TargetKind =
  | 'license'
  | 'device'
  | 'customer'
  | 'admin'
  | 'session'
  | 'system';

export type SecurityEventKind =
  | 'failed_login'
  | 'rate_limit_exceeded'
  | 'invalid_csrf'
  | 'suspicious_activation'
  | 'brute_force_suspected';

export interface PlanConfig {
  label: string;
  durationMs: number | null;
  prefix: string;
}

export interface License {
  id: string;
  plan: Plan;
  status: LicenseStatus;
  deviceLimit: number;
  activationStartedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  suspendedAt: Date | null;
  createdBy: string;
  customerId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Device {
  id: string;
  licenseId: string;
  deviceId: string;
  fingerprint: string | null;
  userAgent: string | null;
  ip: string | null;
  activatedAt: Date;
  lastSeenAt: Date;
  deactivatedAt: Date | null;
}

export interface Admin {
  id: string;
  email: string;
  role: AdminRole;
  permissions: string[];
  isSuspended: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  email: string | null;
  isBanned: boolean;
  createdAt: Date;
}

export interface AuditEvent {
  id: string;
  actorKind: ActorKind;
  actorId: string | null;
  action: string;
  targetKind: TargetKind | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface SecurityEvent {
  id: string;
  kind: SecurityEventKind;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// Extension storage shape
export interface ExtensionSettings {
  theme: 'dark' | 'light';
  backendUrl: string;
  ai: {
    endpoint: string;
    apiKey: string;
    model: string;
    providerLabel: string;
  };
  privacy: {
    enabled: boolean;
    allowlist: string[];
    blocklist: string[];
  };
  features: {
    assistant: boolean;
    privacy: boolean;
    productivity: boolean;
    devtools: boolean;
  };
  license: {
    key: string;
    lastChecked: number | null;
    status: LicenseStatus | null;
  };
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  theme: 'dark',
  backendUrl: '',
  ai: {
    endpoint: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    providerLabel: 'OpenAI',
  },
  privacy: {
    enabled: true,
    allowlist: [],
    blocklist: [],
  },
  features: {
    assistant: true,
    privacy: true,
    productivity: true,
    devtools: true,
  },
  license: {
    key: '',
    lastChecked: null,
    status: null,
  },
};
