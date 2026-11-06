// ============================================================
// NEXORA Service Worker (MV3 ES Module)
// ============================================================

import { getSettings, saveSettings } from '../lib/storage.js';
import { checkLicenseStatus, getDeviceId } from '../lib/license.js';

// ---- Context Menu Setup ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'nexora-inspect-element',
    title: 'Inspect with NEXORA',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'nexora-copy-url',
    title: 'Copy page URL',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'nexora-inspect-element' && info.selectionText) {
    chrome.storage.local.set({ context_selection: info.selectionText });
  }
  if (info.menuItemId === 'nexora-copy-url' && tab?.url) {
    chrome.storage.local.set({ context_url: tab.url });
  }
});

// ---- Message Routing ----
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as { type: string; payload?: unknown };
  handleMessage(msg)
    .then(sendResponse)
    .catch((err) => {
      sendResponse({ ok: false, error: String(err) });
    });
  return true; // Keep message channel open for async response
});

async function handleMessage(msg: {
  type: string;
  payload?: unknown;
}): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  switch (msg.type) {
    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { ok: true, data: settings };
    }

    case 'SAVE_SETTINGS': {
      const partial = msg.payload as Parameters<typeof saveSettings>[0];
      await saveSettings(partial);
      return { ok: true };
    }

    case 'GET_TRACKER_STATS': {
      const stats = await getTrackerStats();
      return { ok: true, data: stats };
    }

    case 'TOGGLE_PRIVACY': {
      const { enabled } = msg.payload as { enabled: boolean };
      await togglePrivacyRules(enabled);
      await saveSettings({
        privacy: {
          enabled,
          allowlist: [],
          blocklist: [],
        },
      });
      return { ok: true };
    }

    case 'CHECK_LICENSE': {
      const settings = await getSettings();
      if (!settings.license.key || !settings.backendUrl) {
        return { ok: true, data: { valid: false, reason: 'License not configured' } };
      }
      const deviceId = await getDeviceId();
      const result = await checkLicenseStatus(
        settings.backendUrl,
        settings.license.key,
        deviceId,
      );
      await saveSettings({
        license: {
          ...settings.license,
          lastChecked: Date.now(),
          status: result.valid ? 'active' : result.status ?? null,
        },
      });
      return { ok: true, data: result };
    }

    case 'GET_NOTES': {
      const notes = await getStoredNotes();
      return { ok: true, data: notes };
    }

    case 'SAVE_NOTES': {
      const { content } = msg.payload as { content: string };
      await storeNotes(content);
      return { ok: true };
    }

    case 'COPY_TO_CLIPBOARD': {
      const { text } = msg.payload as { text: string };
      return { ok: true, data: text };
    }

    default:
      return { ok: false, error: `Unknown message type: ${msg.type}` };
  }
}

async function getTrackerStats(): Promise<{ blocked: number; lastReset: number }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tracker_blocked', 'tracker_lastReset'], (items) => {
      resolve({
        blocked: (items['tracker_blocked'] as number) ?? 0,
        lastReset: (items['tracker_lastReset'] as number) ?? Date.now(),
      });
    });
  });
}

async function storeNotes(content: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ notes: content }, () => resolve());
  });
}

async function getStoredNotes(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('notes', (items) => {
      resolve((items['notes'] as string) ?? '');
    });
  });
}

async function togglePrivacyRules(enabled: boolean): Promise<void> {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabled ? ['tracker_rules'] : [],
    disableRulesetIds: enabled ? [] : ['tracker_rules'],
  });
}

// ---- Periodic License Check (every hour) ----
chrome.alarms.create('license-check', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'license-check') {
    const settings = await getSettings();
    if (!settings.license.key || !settings.backendUrl) return;
    const deviceId = await getDeviceId();
    const result = await checkLicenseStatus(
      settings.backendUrl,
      settings.license.key,
      deviceId,
    );
    await saveSettings({
      license: {
        ...settings.license,
        lastChecked: Date.now(),
        status: result.valid ? 'active' : result.status ?? null,
      },
    });
  }
});
