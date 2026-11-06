// ============================================================
// NEXORA Extension Storage
// Typed wrappers around chrome.storage.local
// ============================================================

import type { ExtensionSettings } from '@nexora/shared/types';
import { DEFAULT_SETTINGS } from '@nexora/shared/types';

export type { ExtensionSettings };

export async function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const merged: ExtensionSettings = {
        theme: (items['theme'] as ExtensionSettings['theme']) ?? DEFAULT_SETTINGS.theme,
        backendUrl: (items['backendUrl'] as string) ?? DEFAULT_SETTINGS.backendUrl,
        ai: {
          endpoint: (items['ai_endpoint'] as string) ?? DEFAULT_SETTINGS.ai.endpoint,
          apiKey: (items['ai_apiKey'] as string) ?? DEFAULT_SETTINGS.ai.apiKey,
          model: (items['ai_model'] as string) ?? DEFAULT_SETTINGS.ai.model,
          providerLabel: (items['ai_providerLabel'] as string) ?? DEFAULT_SETTINGS.ai.providerLabel,
        },
        privacy: {
          enabled: (items['privacy_enabled'] as boolean) ?? DEFAULT_SETTINGS.privacy.enabled,
          allowlist: (items['privacy_allowlist'] as string[]) ?? DEFAULT_SETTINGS.privacy.allowlist,
          blocklist: (items['privacy_blocklist'] as string[]) ?? DEFAULT_SETTINGS.privacy.blocklist,
        },
        features: {
          assistant: (items['feature_assistant'] as boolean) ?? DEFAULT_SETTINGS.features.assistant,
          privacy: (items['feature_privacy'] as boolean) ?? DEFAULT_SETTINGS.features.privacy,
          productivity: (items['feature_productivity'] as boolean) ?? DEFAULT_SETTINGS.features.productivity,
          devtools: (items['feature_devtools'] as boolean) ?? DEFAULT_SETTINGS.features.devtools,
        },
        license: {
          key: (items['license_key'] as string) ?? DEFAULT_SETTINGS.license.key,
          lastChecked: (items['license_lastChecked'] as number | null) ?? DEFAULT_SETTINGS.license.lastChecked,
          status: (items['license_status'] as ExtensionSettings['license']['status']) ?? DEFAULT_SETTINGS.license.status,
        },
      };
      resolve(merged);
    });
  });
}

export async function saveSettings(partial: Partial<ExtensionSettings>): Promise<void> {
  const flat: Record<string, unknown> = {};
  if (partial.theme !== undefined) flat['theme'] = partial.theme;
  if (partial.backendUrl !== undefined) flat['backendUrl'] = partial.backendUrl;
  if (partial.ai) {
    if (partial.ai.endpoint !== undefined) flat['ai_endpoint'] = partial.ai.endpoint;
    if (partial.ai.apiKey !== undefined) flat['ai_apiKey'] = partial.ai.apiKey;
    if (partial.ai.model !== undefined) flat['ai_model'] = partial.ai.model;
    if (partial.ai.providerLabel !== undefined) flat['ai_providerLabel'] = partial.ai.providerLabel;
  }
  if (partial.privacy) {
    if (partial.privacy.enabled !== undefined) flat['privacy_enabled'] = partial.privacy.enabled;
    if (partial.privacy.allowlist !== undefined) flat['privacy_allowlist'] = partial.privacy.allowlist;
    if (partial.privacy.blocklist !== undefined) flat['privacy_blocklist'] = partial.privacy.blocklist;
  }
  if (partial.features) {
    if (partial.features.assistant !== undefined) flat['feature_assistant'] = partial.features.assistant;
    if (partial.features.privacy !== undefined) flat['feature_privacy'] = partial.features.privacy;
    if (partial.features.productivity !== undefined) flat['feature_productivity'] = partial.features.productivity;
    if (partial.features.devtools !== undefined) flat['feature_devtools'] = partial.features.devtools;
  }
  if (partial.license) {
    if (partial.license.key !== undefined) flat['license_key'] = partial.license.key;
    if (partial.license.lastChecked !== undefined) flat['license_lastChecked'] = partial.license.lastChecked;
    if (partial.license.status !== undefined) flat['license_status'] = partial.license.status;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.set(flat, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

// Notes storage
export async function getNotes(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('notes', (items) => {
      resolve((items['notes'] as string) ?? '');
    });
  });
}

export async function saveNotes(content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ notes: content }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

// Tracker stats storage
export async function getTrackerStats(): Promise<{ blocked: number; lastReset: number }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tracker_blocked', 'tracker_lastReset'], (items) => {
      resolve({
        blocked: (items['tracker_blocked'] as number) ?? 0,
        lastReset: (items['tracker_lastReset'] as number) ?? Date.now(),
      });
    });
  });
}

export async function incrementTrackerCount(): Promise<void> {
  const stats = await getTrackerStats();
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ tracker_blocked: stats.blocked + 1 }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}
