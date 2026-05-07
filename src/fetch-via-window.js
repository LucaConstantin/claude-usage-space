const { BrowserWindow } = require('electron');

const BLOCKED_SIGNATURES = [
  { pattern: 'Just a moment', error: 'CloudflareBlocked' },
  { pattern: 'Enable JavaScript and cookies to continue', error: 'CloudflareChallenge' },
  { pattern: '<html', error: 'UnexpectedHTML' },
];

function parseResponseBody(bodyText) {
  for (const sig of BLOCKED_SIGNATURES) {
    if (bodyText.includes(sig.pattern)) {
      throw new Error(`${sig.error}: ${bodyText.substring(0, 200)}`);
    }
  }
  try {
    return JSON.parse(bodyText);
  } catch (parseErr) {
    throw new Error('InvalidJSON: ' + bodyText.substring(0, 200));
  }
}

function fetchViaWindow(url, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const timeout = setTimeout(() => {
      win.close();
      reject(new Error('Request timeout'));
    }, timeoutMs);

    win.webContents.on('did-finish-load', async () => {
      try {
        const bodyText = await win.webContents.executeJavaScript(
          'document.body.innerText || document.body.textContent'
        );
        clearTimeout(timeout);
        win.close();
        const data = parseResponseBody(bodyText);
        resolve(data);
      } catch (err) {
        clearTimeout(timeout);
        win.close();
        reject(err);
      }
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      clearTimeout(timeout);
      win.close();
      reject(new Error(`LoadFailed: ${errorCode} ${errorDescription}`));
    });

    win.loadURL(url);
  });
}

function fetchMultipleViaWindow(urls, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 800, height: 600, show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    const results = [];
    let currentIndex = 0;
    let currentTimeout = null;

    function loadNext() {
      if (currentIndex >= urls.length) { win.close(); resolve(results); return; }
      currentTimeout = setTimeout(() => { win.close(); reject(new Error('Request timeout')); }, timeoutMs);
      win.loadURL(urls[currentIndex]);
    }

    win.webContents.on('did-finish-load', async () => {
      try {
        const bodyText = await win.webContents.executeJavaScript('document.body.innerText || document.body.textContent');
        if (currentTimeout) { clearTimeout(currentTimeout); currentTimeout = null; }
        const data = parseResponseBody(bodyText);
        results.push(data);
        currentIndex++;
        loadNext();
      } catch (err) {
        if (currentTimeout) { clearTimeout(currentTimeout); currentTimeout = null; }
        win.close();
        reject(err);
      }
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      if (currentTimeout) { clearTimeout(currentTimeout); currentTimeout = null; }
      win.close();
      reject(new Error(`LoadFailed: ${errorCode} ${errorDescription}`));
    });

    loadNext();
  });
}

module.exports = { fetchViaWindow, fetchMultipleViaWindow };
