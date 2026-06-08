chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') {
    sendResponse({ type: 'PONG' });
    return; // sync response
  }
  if (msg?.type === 'SAVE') {
    chrome.storage.local.get('saved').then((cur) => {
      const saved = Array.isArray(cur.saved) ? cur.saved : [];
      saved.push(msg.value);
      chrome.storage.local.set({ saved }).then(() => sendResponse({ ok: true }));
    });
    return true; // async response
  }
  if (msg?.type === 'ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) =>
      sendResponse({ url: tab?.url ?? null }),
    );
    return true;
  }
  if (msg?.type === 'SAVE_WINDOW') {
    chrome.tabs.query({ windowId: msg.windowId }).then((tabs) => {
      const urls = tabs.map((t) => t.url);
      chrome.storage.local.set({ savedWindow: urls }).then(() => sendResponse({ ok: true, count: urls.length }));
    });
    return true; // async response
  }
});
