const { BrowserWindow } = require('electron');

const BLOCKED_SIGNATURES = [
  { pattern: 'Just a moment', error: 'CloudflareBlocked' },
  { pattern: 'Enable JavaScript and cookies to continue', error: 'CloudflareChallenge' },
];

function parseResponseBody(bodyText) {
  const trimmed = bodyText.trim();
  if (!trimmed) throw new Error('EmptyResponse');

  for (const sig of BLOCKED_SIGNATURES) {
    if (trimmed.includes(sig.pattern)) {
      throw new Error(`${sig.error}: ${trimmed.substring(0, 200)}`);
    }
  }

  // Reject obvious HTML pages (API should return JSON)
  if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) {
    throw new Error('UnexpectedHTML: ' + trimmed.substring(0, 200));
  }

  try {
    return JSON.parse(trimmed);
  } catch (parseErr) {
    throw new Error('InvalidJSON: ' + trimmed.substring(0, 200));
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

    let settled = false;
    const settle = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      win.close();
      fn(val);
    };

    const timeout = setTimeout(() => {
      settle(reject, new Error('Request timeout'));
    }, timeoutMs);

    win.webContents.on('did-finish-load', async () => {
      // Ignore about:blank and other non-target loads
      const currentUrl = win.webContents.getURL();
      if (!currentUrl || currentUrl === 'about:blank') return;

      try {
        const bodyText = await win.webContents.executeJavaScript(
          'document.body.innerText || document.body.textContent'
        );
        const data = parseResponseBody(bodyText);
        settle(resolve, data);
      } catch (err) {
        settle(reject, err);
      }
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      // Ignore aborted loads (e.g. rapid navigation)
      if (errorCode === -3) return;
      settle(reject, new Error(`LoadFailed: ${errorCode} ${errorDescription}`));
    });

    win.loadURL(url);
  });
}

function fetchMultipleViaWindow(urls, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 800, height: 600, show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    let settled = false;
    const settle = (fn, val) => {
      if (settled) return;
      settled = true;
      if (currentTimeout) clearTimeout(currentTimeout);
      win.close();
      fn(val);
    };

    const results = [];
    let currentIndex = 0;
    let currentTimeout = null;

    function loadNext() {
      if (currentIndex >= urls.length) {
        settle(resolve, results);
        return;
      }
      currentTimeout = setTimeout(() => {
        settle(reject, new Error(`Request timeout on URL ${currentIndex}`));
      }, timeoutMs);
      win.loadURL(urls[currentIndex]);
    }

    win.webContents.on('did-finish-load', async () => {
      const currentUrl = win.webContents.getURL();
      if (!currentUrl || currentUrl === 'about:blank') return;

      try {
        const bodyText = await win.webContents.executeJavaScript(
          'document.body.innerText || document.body.textContent'
        );
        if (currentTimeout) { clearTimeout(currentTimeout); currentTimeout = null; }
        const data = parseResponseBody(bodyText);
        results.push(data);
        currentIndex++;
        loadNext();
      } catch (err) {
        if (currentTimeout) { clearTimeout(currentTimeout); currentTimeout = null; }
        // For non-critical endpoints (overage, prepaid), push null and continue
        if (currentIndex > 0) {
          results.push(null);
          currentIndex++;
          loadNext();
        } else {
          settle(reject, err);
        }
      }
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      if (errorCode === -3) return;
      // For non-critical endpoints, push null and continue
      if (currentIndex > 0) {
        if (currentTimeout) { clearTimeout(currentTimeout); currentTimeout = null; }
        results.push(null);
        currentIndex++;
        loadNext();
      } else {
        settle(reject, new Error(`LoadFailed: ${errorCode} ${errorDescription}`));
      }
    });

    loadNext();
  });
}

module.exports = { fetchViaWindow, fetchMultipleViaWindow };
