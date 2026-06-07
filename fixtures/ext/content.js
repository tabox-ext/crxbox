// Shadow-DOM UI
const host = document.createElement('div');
host.setAttribute('data-ext-root', 'shadow');
const shadow = host.attachShadow({ mode: 'open' });
const btn = document.createElement('button');
btn.textContent = 'Save article';
btn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'SAVE', value: { url: location.href } }));
shadow.appendChild(btn);
document.documentElement.appendChild(host);

// iframe UI
const iframe = document.createElement('iframe');
iframe.setAttribute('data-ext-frame', 'true');
iframe.src = chrome.runtime.getURL('iframe.html');
document.documentElement.appendChild(iframe);
