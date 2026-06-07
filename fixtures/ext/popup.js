// popup.js
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  document.getElementById('active-tab').textContent = tab?.url ?? 'none';
});
document.getElementById('save').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.runtime.sendMessage({ type: 'SAVE', value: { url: tab?.url } });
});
