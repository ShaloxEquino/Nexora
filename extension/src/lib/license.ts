// ============================================================
// NEXORA Extension License Client
// ============================================================

import type { LicenseStatusResponse } from '@nexora/shared/api-contracts';

export async function checkLicenseStatus(
  backendUrl: string,
  key: string,
  deviceId: string,
): Promise<LicenseStatusResponse> {
  if (!backendUrl) {
    return { valid: false, reason: 'Backend URL not configured' };
  }
  try {
    const url = new URL('/api/license/status', backendUrl);
    url.searchParams.set('key', key);
    url.searchParams.set('deviceId', deviceId);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return {
        valid: false,
        reason: body.error?.message ?? 'Server error',
      };
    }
    return (await response.json()) as LicenseStatusResponse;
  } catch {
    return { valid: false, reason: 'Backend unavailable' };
  }
}

export async function activateLicense(
  backendUrl: string,
  key: string,
  deviceId: string,
  fingerprint: string,
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  if (!backendUrl) return { ok: false, error: 'Backend URL not configured' };
  try {
    const response = await fetch(`${backendUrl}/api/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        deviceId,
        deviceFingerprint: fingerprint,
        userAgent: navigator.userAgent,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json();
    if (!response.ok) {
      return {
        ok: false,
        error:
          (body as { error?: { message?: string } }).error?.message ??
          'Activation failed',
      };
    }
    return { ok: true, data: body };
  } catch {
    return { ok: false, error: 'Backend unavailable' };
  }
}

/** Generate or retrieve a stable device ID based on browser storage */
export async function getDeviceId(): Promise<string> {
  const stored = await new Promise<string | undefined>((resolve) => {
    chrome.storage.local.get('_deviceId', (items) => {
      resolve(items['_deviceId'] as string | undefined);
    });
  });
  if (stored) return stored;

  const id = crypto.randomUUID();
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ _deviceId: id }, () => resolve());
  });
  return id;
}
