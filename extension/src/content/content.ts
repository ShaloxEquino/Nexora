// ============================================================
// NEXORA Content Script
// Runs in page context. Minimal footprint.
// Page context is only read after explicit user permission.
// ============================================================

// Listen for messages from the popup or service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as { type: string };

  if (msg.type === 'GET_PAGE_CONTEXT') {
    // Only provide context when explicitly requested
    const context = {
      url: window.location.href,
      title: document.title,
      // Provide a text summary of the visible content (trimmed)
      selectedText: window.getSelection()?.toString()?.slice(0, 2000) ?? '',
      metaDescription:
        (
          document.querySelector(
            'meta[name="description"]',
          ) as HTMLMetaElement | null
        )?.content?.slice(0, 500) ?? '',
    };
    sendResponse({ ok: true, data: context });
    return true;
  }

  if (msg.type === 'SCROLL_TOP') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    sendResponse({ ok: true });
    return true;
  }

  sendResponse({ ok: false, error: 'Unknown message type' });
  return true;
});
