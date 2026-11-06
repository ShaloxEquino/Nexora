// ============================================================
// NEXORA Popup Controller
// ============================================================

import { getSettings, saveSettings } from '../lib/storage.js';
import { activateLicense, checkLicenseStatus, getDeviceId } from '../lib/license.js';
import { streamChatCompletion } from '../lib/ai.js';
import {
  formatJson,
  encodeBase64,
  decodeBase64,
  parseUrl,
  convertTimestamp,
  inspectJwt,
} from '../lib/dev-tools.js';
import { sha256, sha1, generateUuid } from '../lib/crypto-tools.js';
import type { ExtensionSettings } from '../lib/storage.js';

// ============================================================
// State
// ============================================================
let settings: ExtensionSettings | null = null;
let chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
let includePageContext = false;
let currentAbortController: AbortController | null = null;

// ============================================================
// Boot
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize tabs and controls immediately so UI is responsive
  initTabs();
  initAssistantTab();
  initPrivacyTab();
  initProductivityTab();
  initDevToolsTab();
  initSettingsTab();

  // Load settings directly from storage (independent of service worker)
  try {
    settings = await getSettings();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }

  // Populate settings fields once loaded
  populateSettingsUI();
  await updateLicenseBadge();
});

// ============================================================
// Tab Navigation
// ============================================================
function initTabs(): void {
  const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  const tabPanels = document.querySelectorAll<HTMLElement>('.tab-panel');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset['tab'];
      if (!target) return;

      tabBtns.forEach((b) => b.classList.remove('active'));
      tabPanels.forEach((p) => {
        p.style.display = 'none';
        p.classList.remove('active');
      });

      btn.classList.add('active');
      const panel = document.getElementById(`tab-${target}`);
      if (panel) {
        panel.style.display = 'block';
        panel.classList.add('active');
      }
    });
  });
}

// ============================================================
// License Badge
// ============================================================
async function updateLicenseBadge(): Promise<void> {
  const badge = document.getElementById('licenseStatus');
  if (!badge) return;

  if (!settings || !settings.license?.key || !settings.backendUrl) {
    badge.textContent = 'Unlicensed';
    badge.className = 'badge badge-neutral';
    return;
  }

  const { license, backendUrl } = settings;

  try {
    const deviceId = await getDeviceId();
    const result = await checkLicenseStatus(backendUrl, license.key, deviceId);

    if (result.valid) {
      badge.textContent = `✓ ${result.plan ?? 'Active'}`;
      badge.className = 'badge badge-success';
    } else {
      badge.textContent = result.reason ?? 'Invalid';
      badge.className = 'badge badge-error';
    }
  } catch {
    badge.textContent = 'Offline';
    badge.className = 'badge badge-warning';
  }
}

function populateSettingsUI(): void {
  if (!settings) return;

  const licenseKeyInput = document.getElementById('licenseKeyInput') as HTMLInputElement | null;
  const backendUrlInput = document.getElementById('backendUrlInput') as HTMLInputElement | null;
  const aiEndpointInput = document.getElementById('aiEndpointInput') as HTMLInputElement | null;
  const aiKeyInput = document.getElementById('aiKeyInput') as HTMLInputElement | null;
  const aiModelInput = document.getElementById('aiModelInput') as HTMLInputElement | null;
  const aiProviderInput = document.getElementById('aiProviderInput') as HTMLInputElement | null;

  if (licenseKeyInput) licenseKeyInput.value = settings.license.key || '';
  if (backendUrlInput) backendUrlInput.value = settings.backendUrl || '';
  if (aiEndpointInput) aiEndpointInput.value = settings.ai.endpoint || '';
  if (aiKeyInput) aiKeyInput.value = settings.ai.apiKey || '';
  if (aiModelInput) aiModelInput.value = settings.ai.model || 'gpt-4o-mini';
  if (aiProviderInput) aiProviderInput.value = settings.ai.providerLabel || 'OpenAI';

  const unconfigured = document.getElementById('aiUnconfigured');
  const chat = document.getElementById('aiChat');
  if (unconfigured && chat) {
    if (!settings.ai.endpoint || !settings.ai.apiKey) {
      unconfigured.style.display = 'block';
    } else {
      unconfigured.style.display = 'none';
    }
  }
}

// ============================================================
// AI Assistant Tab
// ============================================================
function initAssistantTab(): void {
  const input = document.getElementById('chatInput') as HTMLTextAreaElement | null;
  const sendBtn = document.getElementById('sendBtn');
  const clearBtn = document.getElementById('clearChatBtn');
  const contextBtn = document.getElementById('addContextBtn');
  const contextNote = document.getElementById('contextNote');
  const streamingIndicator = document.getElementById('streamingIndicator');

  if (!input || !sendBtn) return;

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendChat();
    }
  });

  sendBtn.addEventListener('click', () => void sendChat());

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      chatHistory = [];
      const msgBox = document.getElementById('chatMessages');
      if (msgBox) msgBox.innerHTML = '';
    });
  }

  if (contextBtn && contextNote) {
    contextBtn.addEventListener('click', () => {
      includePageContext = !includePageContext;
      contextNote.style.display = includePageContext ? 'block' : 'none';
    });
  }

  async function sendChat(): Promise<void> {
    if (!input) return;
    const userText = input.value.trim();
    if (!userText) return;

    if (!settings?.ai?.endpoint || !settings.ai.apiKey) {
      const bubble = appendChatMessage('assistant', 'AI is not configured. Please enter your endpoint and API key in Settings.');
      bubble.style.color = 'var(--color-error)';
      return;
    }

    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();

    let messageText = userText;

    if (includePageContext) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const ctxResp = (await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' })) as {
            ok: boolean;
            data?: { url: string; title: string; selectedText: string; metaDescription: string };
          };
          if (ctxResp?.ok && ctxResp.data) {
            const ctx = ctxResp.data;
            messageText = `[Page: ${ctx.title} — ${ctx.url}]\n${ctx.selectedText ? `Selected: "${ctx.selectedText}"\n` : ''}${ctx.metaDescription ? `Description: ${ctx.metaDescription}\n` : ''}\n${userText}`;
          }
        }
      } catch {}
      includePageContext = false;
      if (contextNote) contextNote.style.display = 'none';
    }

    input.value = '';
    appendChatMessage('user', userText);
    chatHistory.push({ role: 'user', content: messageText });

    sendBtn?.setAttribute('disabled', '');
    if (streamingIndicator) streamingIndicator.style.display = 'inline';

    const assistantBubble = appendChatMessage('assistant', '');
    let accumulated = '';

    await streamChatCompletion(
      settings.ai,
      [
        { role: 'system', content: 'You are NEXORA, a helpful browser extension assistant. Answer concisely and accurately.' },
        ...chatHistory,
      ],
      {
        onToken: (token) => {
          accumulated += token;
          assistantBubble.textContent = accumulated;
          const msgContainer = document.getElementById('chatMessages');
          if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
        },
        onDone: () => {
          chatHistory.push({ role: 'assistant', content: accumulated });
          sendBtn?.removeAttribute('disabled');
          if (streamingIndicator) streamingIndicator.style.display = 'none';
        },
        onError: (err) => {
          assistantBubble.textContent = `Error: ${err}`;
          assistantBubble.style.color = 'var(--color-error)';
          sendBtn?.removeAttribute('disabled');
          if (streamingIndicator) streamingIndicator.style.display = 'none';
        },
      },
      currentAbortController.signal,
    );
  }
}

function appendChatMessage(role: 'user' | 'assistant', text: string): HTMLElement {
  const messages = document.getElementById('chatMessages')!;
  const msg = document.createElement('div');
  msg.className = `chat-message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = text;
  msg.appendChild(bubble);
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

// ============================================================
// Privacy Tab
// ============================================================
function initPrivacyTab(): void {
  const toggle = document.getElementById('privacyToggle') as HTMLInputElement | null;
  const currentSite = document.getElementById('currentSiteDomain');
  const allowBtn = document.getElementById('allowSiteBtn');
  const blockBtn = document.getElementById('blockSiteBtn');
  const saveDomainLists = document.getElementById('saveDomainLists');
  const allowlistArea = document.getElementById('allowlistArea') as HTMLTextAreaElement | null;
  const blocklistArea = document.getElementById('blocklistArea') as HTMLTextAreaElement | null;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.url && currentSite) {
      try {
        currentSite.textContent = new URL(tab.url).hostname;
      } catch {
        currentSite.textContent = '—';
      }
    }
  });

  toggle?.addEventListener('change', async () => {
    if (!settings) return;
    settings.privacy.enabled = toggle.checked;
    await saveSettings({ privacy: settings.privacy });
    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: toggle.checked ? ['tracker_rules'] : [],
        disableRulesetIds: toggle.checked ? [] : ['tracker_rules'],
      });
    } catch {}
  });

  saveDomainLists?.addEventListener('click', async () => {
    if (!settings || !allowlistArea || !blocklistArea) return;
    const allowlist = allowlistArea.value.split('\n').map((s) => s.trim()).filter(Boolean);
    const blocklist = blocklistArea.value.split('\n').map((s) => s.trim()).filter(Boolean);
    settings.privacy.allowlist = allowlist;
    settings.privacy.blocklist = blocklist;
    await saveSettings({ privacy: settings.privacy });
    saveDomainLists.textContent = '✓ Saved';
    setTimeout(() => { saveDomainLists.textContent = 'Save Lists'; }, 1500);
  });
}

// ============================================================
// Productivity Tab
// ============================================================
function initProductivityTab(): void {
  const saveNotesBtn = document.getElementById('saveNotesBtn');
  const notesArea = document.getElementById('notesArea') as HTMLTextAreaElement | null;
  const groupTabsBtn = document.getElementById('groupTabsBtn');
  const closeOtherTabsBtn = document.getElementById('closeOtherTabsBtn');
  const copyAllUrlsBtn = document.getElementById('copyAllUrlsBtn');
  const copyPageUrlBtn = document.getElementById('copyPageUrlBtn');
  const copyPageTitleBtn = document.getElementById('copyPageTitleBtn');

  chrome.storage.local.get('notes', (items) => {
    if (notesArea && typeof items['notes'] === 'string') {
      notesArea.value = items['notes'];
    }
  });

  saveNotesBtn?.addEventListener('click', () => {
    if (!notesArea) return;
    chrome.storage.local.set({ notes: notesArea.value }, () => {
      if (saveNotesBtn) {
        saveNotesBtn.textContent = '✓ Saved';
        setTimeout(() => { saveNotesBtn.textContent = 'Save'; }, 1500);
      }
    });
  });

  groupTabsBtn?.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const groups = new Map<string, number[]>();
    for (const tab of tabs) {
      if (!tab.url || !tab.id) continue;
      try {
        const domain = new URL(tab.url).hostname;
        if (!groups.has(domain)) groups.set(domain, []);
        groups.get(domain)!.push(tab.id);
      } catch {}
    }
    for (const [domain, ids] of groups.entries()) {
      if (ids.length < 2) continue;
      const groupId = await chrome.tabs.group({ tabIds: ids });
      await chrome.tabGroups.update(groupId, { title: domain });
    }
  });

  closeOtherTabsBtn?.addEventListener('click', async () => {
    const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!current?.id) return;
    const others = await chrome.tabs.query({ currentWindow: true });
    await chrome.tabs.remove(others.filter((t) => t.id !== current.id).map((t) => t.id!));
  });

  copyAllUrlsBtn?.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const urls = tabs.map((t) => t.url).filter(Boolean).join('\n');
    await navigator.clipboard.writeText(urls);
    if (copyAllUrlsBtn) {
      copyAllUrlsBtn.textContent = '✓ Copied';
      setTimeout(() => { copyAllUrlsBtn.textContent = 'Copy All Tab URLs'; }, 1500);
    }
  });

  copyPageUrlBtn?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) await navigator.clipboard.writeText(tab.url);
    if (copyPageUrlBtn) {
      copyPageUrlBtn.textContent = '✓ Copied';
      setTimeout(() => { copyPageUrlBtn.textContent = 'Copy Page URL'; }, 1500);
    }
  });

  copyPageTitleBtn?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.title) await navigator.clipboard.writeText(tab.title);
    if (copyPageTitleBtn) {
      copyPageTitleBtn.textContent = '✓ Copied';
      setTimeout(() => { copyPageTitleBtn.textContent = 'Copy Page Title'; }, 1500);
    }
  });
}

// ============================================================
// Dev Tools Tab
// ============================================================
function initDevToolsTab(): void {
  const devBtns = document.querySelectorAll<HTMLButtonElement>('.devtool-btn');
  const devPanels = document.querySelectorAll<HTMLElement>('.devtool-panel');

  devBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      devBtns.forEach((b) => b.classList.remove('active'));
      devPanels.forEach((p) => {
        p.style.display = 'none';
        p.classList.remove('active');
      });
      btn.classList.add('active');
      const panel = document.getElementById(`devtool-${btn.dataset['tool']}`);
      if (panel) {
        panel.style.display = 'block';
        panel.classList.add('active');
      }
    });
  });

  // JSON Formatter
  const jsonInput = document.getElementById('jsonInput') as HTMLTextAreaElement | null;
  const jsonOutput = document.getElementById('jsonOutput');
  const jsonError = document.getElementById('jsonError');

  document.getElementById('jsonFormatBtn')?.addEventListener('click', () => {
    if (!jsonInput || !jsonOutput || !jsonError) return;
    const result = formatJson(jsonInput.value);
    jsonError.style.display = 'none';
    if (result.ok) {
      jsonOutput.textContent = result.formatted ?? '';
      jsonOutput.style.display = 'block';
    } else {
      jsonOutput.style.display = 'none';
      jsonError.textContent = result.error ?? 'Parse error';
      jsonError.style.display = 'block';
    }
  });

  // Base64
  const b64Input = document.getElementById('b64Input') as HTMLTextAreaElement | null;
  const b64Output = document.getElementById('b64Output');

  document.getElementById('b64EncodeBtn')?.addEventListener('click', () => {
    if (b64Input && b64Output) {
      b64Output.textContent = encodeBase64(b64Input.value);
      b64Output.style.display = 'block';
    }
  });

  document.getElementById('b64DecodeBtn')?.addEventListener('click', () => {
    if (b64Input && b64Output) {
      const res = decodeBase64(b64Input.value);
      b64Output.textContent = res.ok ? (res.value ?? '') : (res.error ?? 'Error');
      b64Output.style.display = 'block';
    }
  });

  // Timestamp
  const tsInput = document.getElementById('tsInput') as HTMLInputElement | null;
  const tsOutput = document.getElementById('tsOutput');

  document.getElementById('tsConvertBtn')?.addEventListener('click', () => {
    if (tsInput && tsOutput) {
      const res = convertTimestamp(tsInput.value);
      if (res.ok && res.result) {
        tsOutput.innerHTML = `<div><strong>ISO:</strong> ${res.result.iso}</div><div><strong>Unix:</strong> ${res.result.unix}</div>`;
        tsOutput.style.display = 'block';
      }
    }
  });

  document.getElementById('tsNowBtn')?.addEventListener('click', () => {
    if (tsInput) tsInput.value = String(Math.floor(Date.now() / 1000));
  });

  // Hash
  const hashInput = document.getElementById('hashInput') as HTMLTextAreaElement | null;
  const hashOutput = document.getElementById('hashOutput');

  document.getElementById('sha256Btn')?.addEventListener('click', async () => {
    if (hashInput && hashOutput) {
      hashOutput.textContent = await sha256(hashInput.value);
      hashOutput.style.display = 'block';
    }
  });

  document.getElementById('uuidBtn')?.addEventListener('click', () => {
    if (hashOutput) {
      hashOutput.textContent = generateUuid();
      hashOutput.style.display = 'block';
    }
  });
}

// ============================================================
// Settings Tab
// ============================================================
function initSettingsTab(): void {
  const licenseKeyInput = document.getElementById('licenseKeyInput') as HTMLInputElement | null;
  const backendUrlInput = document.getElementById('backendUrlInput') as HTMLInputElement | null;
  const activateBtn = document.getElementById('activateLicenseBtn');
  const checkBtn = document.getElementById('checkLicenseBtn');
  const licenseMessage = document.getElementById('licenseMessage');

  const aiEndpointInput = document.getElementById('aiEndpointInput') as HTMLInputElement | null;
  const aiKeyInput = document.getElementById('aiKeyInput') as HTMLInputElement | null;
  const aiModelInput = document.getElementById('aiModelInput') as HTMLInputElement | null;
  const aiProviderInput = document.getElementById('aiProviderInput') as HTMLInputElement | null;
  const saveAiBtn = document.getElementById('saveAiBtn');

  function showLicenseMsg(text: string, ok: boolean): void {
    if (!licenseMessage) return;
    licenseMessage.textContent = text;
    licenseMessage.className = ok ? 'badge badge-success' : 'badge badge-error';
    licenseMessage.style.display = 'block';
    setTimeout(() => { licenseMessage.style.display = 'none'; }, 4000);
  }

  activateBtn?.addEventListener('click', async () => {
    const key = licenseKeyInput?.value.trim() || '';
    const backendUrl = backendUrlInput?.value.trim() || '';
    if (!key || !backendUrl) {
      showLicenseMsg('Please enter key and backend URL', false);
      return;
    }

    if (settings) {
      settings.backendUrl = backendUrl;
      settings.license.key = key;
      await saveSettings(settings);
    }

    activateBtn.setAttribute('disabled', '');
    activateBtn.textContent = 'Activating…';

    try {
      const deviceId = await getDeviceId();
      const result = await activateLicense(backendUrl, key, deviceId, navigator.userAgent);
      if (result.ok) {
        showLicenseMsg('License activated successfully!', true);
        await updateLicenseBadge();
      } else {
        showLicenseMsg(result.error ?? 'Activation failed', false);
      }
    } catch (err) {
      showLicenseMsg('Server unreachable', false);
    } finally {
      activateBtn.removeAttribute('disabled');
      activateBtn.textContent = 'Activate';
    }
  });

  checkBtn?.addEventListener('click', async () => {
    await updateLicenseBadge();
    showLicenseMsg('Status refreshed', true);
  });

  saveAiBtn?.addEventListener('click', async () => {
    if (!settings) settings = await getSettings();
    settings.ai = {
      endpoint: aiEndpointInput?.value.trim() || '',
      apiKey: aiKeyInput?.value.trim() || '',
      model: aiModelInput?.value.trim() || 'gpt-4o-mini',
      providerLabel: aiProviderInput?.value.trim() || 'OpenAI',
    };
    await saveSettings({ ai: settings.ai });
    if (saveAiBtn) {
      saveAiBtn.textContent = '✓ Saved';
      setTimeout(() => { saveAiBtn.textContent = 'Save AI Settings'; }, 1500);
    }
  });
}
