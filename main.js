const { app, BrowserWindow, ipcMain, session, safeStorage, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const Store = require('electron-store');
const { fetchViaWindow, fetchMultipleViaWindow } = require('./src/fetch-via-window');

const store = new Store();

const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let mainWindow = null;

app.on('ready', () => {
  session.defaultSession.setUserAgent(CHROME_USER_AGENT);
});

async function setSessionCookie(sessionKey) {
  await session.defaultSession.cookies.set({
    url: 'https://claude.ai',
    name: 'sessionKey',
    value: sessionKey,
    domain: '.claude.ai',
    path: '/',
    secure: true,
    httpOnly: true
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    backgroundColor: '#000005',
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('src/index.html');
  mainWindow.setMenuBarVisibility(false);

  // Auto-approve display media requests for system audio capture (bass detection)
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback(null);
      }
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// IPC: Get credentials
ipcMain.handle('get-credentials', () => {
  let sessionKey = null;
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = store.get('sessionKey_encrypted');
    if (encrypted) {
      try {
        sessionKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (err) {}
    }
  } else {
    sessionKey = store.get('sessionKey');
  }
  return {
    sessionKey,
    organizationId: store.get('organizationId')
  };
});

// IPC: Save credentials
ipcMain.handle('save-credentials', async (event, { sessionKey, organizationId }) => {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(sessionKey);
    store.set('sessionKey_encrypted', encrypted.toString('base64'));
    store.delete('sessionKey');
  } else {
    store.set('sessionKey', sessionKey);
  }
  if (organizationId) {
    store.set('organizationId', organizationId);
  }
  await setSessionCookie(sessionKey);
  return true;
});

// IPC: Delete credentials
ipcMain.handle('delete-credentials', async () => {
  store.delete('sessionKey');
  store.delete('sessionKey_encrypted');
  store.delete('organizationId');
  const cookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai' });
  for (const cookie of cookies) {
    await session.defaultSession.cookies.remove('https://claude.ai', cookie.name);
  }
  return true;
});

// IPC: Validate session key
ipcMain.handle('validate-session-key', async (event, sessionKey) => {
  try {
    await setSessionCookie(sessionKey);
    const data = await fetchViaWindow('https://claude.ai/api/organizations');

    if (data && Array.isArray(data) && data.length > 0) {
      const chatOrgs = data.filter(org =>
        org.capabilities && org.capabilities.includes('chat')
      );
      if (chatOrgs.length === 0) {
        return { success: false, error: 'No chat-enabled organizations found' };
      }
      const defaultOrg = chatOrgs.find(org => org.raven_type === 'team') || chatOrgs[0];
      const orgId = defaultOrg.uuid || defaultOrg.id;
      return { success: true, organizationId: orgId };
    }
    return { success: false, error: 'No organization found' };
  } catch (error) {
    await session.defaultSession.cookies.remove('https://claude.ai', 'sessionKey');
    return { success: false, error: error.message };
  }
});

// IPC: Detect session key via login window
ipcMain.handle('detect-session-key', async () => {
  try {
    await session.defaultSession.cookies.remove('https://claude.ai', 'sessionKey');
  } catch (e) {}

  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Claude Login',
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    let resolved = false;
    const allowedDomains = ['claude.ai', 'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com'];

    loginWin.webContents.on('will-navigate', (event, url) => {
      try {
        const hostname = new URL(url).hostname;
        const isAllowed = allowedDomains.some(d => hostname === d || hostname.endsWith('.' + d));
        if (!isAllowed) event.preventDefault();
      } catch { event.preventDefault(); }
    });

    const onCookieChanged = (event, cookie, cause, removed) => {
      if (cookie.name === 'sessionKey' && cookie.domain.includes('claude.ai') && !removed && cookie.value) {
        resolved = true;
        session.defaultSession.cookies.removeListener('changed', onCookieChanged);
        loginWin.close();
        resolve({ success: true, sessionKey: cookie.value });
      }
    };

    session.defaultSession.cookies.on('changed', onCookieChanged);

    loginWin.on('closed', () => {
      session.defaultSession.cookies.removeListener('changed', onCookieChanged);
      if (!resolved) resolve({ success: false, error: 'Login window closed' });
    });

    loginWin.loadURL('https://claude.ai/login');
  });
});

// IPC: Fetch usage data + spending info
ipcMain.handle('fetch-usage-data', async () => {
  let sessionKey = null;
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = store.get('sessionKey_encrypted');
    if (encrypted) {
      try {
        sessionKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (err) {}
    }
  } else {
    sessionKey = store.get('sessionKey');
  }
  const organizationId = store.get('organizationId');

  if (!sessionKey || !organizationId) throw new Error('Missing credentials');

  await setSessionCookie(sessionKey);

  const usageUrl = `https://claude.ai/api/organizations/${organizationId}/usage`;
  const overageUrl = `https://claude.ai/api/organizations/${organizationId}/overage_spend_limit`;
  const prepaidUrl = `https://claude.ai/api/organizations/${organizationId}/prepaid/credits`;
  const orgsUrl = `https://claude.ai/api/organizations`;

  let data;
  try {
    const results = await fetchMultipleViaWindow([usageUrl, overageUrl, prepaidUrl, orgsUrl]);
    data = results[0];
    const overage = results[1];
    const prepaid = results[2];
    const orgs = results[3];

    // Detect the subscription plan (Pro / Max 5x / Max 20x / …) so the renderer
    // can scale its token/cost estimates to the user's actual tier.
    data.plan = detectPlan(orgs, organizationId);

    // Merge overage spending data
    if (overage) {
      const limit = overage.monthly_credit_limit ?? overage.spend_limit_amount_cents;
      const used = overage.used_credits ?? overage.balance_cents;
      const enabled = overage.is_enabled !== undefined ? overage.is_enabled : (limit != null);

      if (enabled && typeof limit === 'number' && typeof used === 'number') {
        data.spending = {
          used_cents: used,
          limit_cents: limit,
          is_enabled: true,
          currency: overage.currency || 'USD'
        };
      } else {
        data.spending = { is_enabled: false, currency: overage.currency || 'USD' };
      }
    }

    // Merge prepaid balance
    if (prepaid && typeof prepaid.amount === 'number') {
      if (!data.spending) data.spending = {};
      data.spending.balance_cents = prepaid.amount;
      if (!data.spending.currency && prepaid.currency) data.spending.currency = prepaid.currency;
    }
  } catch (err) {
    // If batch fails, try usage alone
    data = await fetchViaWindow(usageUrl);
  }

  // Check for blocked responses
  if (!data || data.error) {
    const msg = data?.error?.message || data?.error || 'Unknown error';
    if (msg.includes('Cloudflare') || msg.includes('Unauthorized')) {
      store.delete('sessionKey');
      store.delete('organizationId');
      throw new Error('SessionExpired');
    }
    throw new Error(msg);
  }

  return data;
});

// Derive the subscription plan + a usage multiplier relative to Pro (×1),
// from the org's rate_limit_tier / capabilities. Used to scale cost/token
// estimates, since the API exposes utilization % but not absolute budgets.
function detectPlan(orgs, organizationId) {
  const list = Array.isArray(orgs) ? orgs : [];
  const org = list.find(o => (o.uuid || o.id) === organizationId)
    || list.find(o => (o.capabilities || []).includes('chat'))
    || list[0];
  const tier = (org && org.rate_limit_tier) || '';
  const caps = (org && org.capabilities) || [];

  let key = 'unknown', label = 'Unknown', factor = 1;
  if (/max[_-]?20x/i.test(tier)) { key = 'max_20x'; label = 'Max 20x'; factor = 20; }
  else if (/max[_-]?5x/i.test(tier)) { key = 'max_5x'; label = 'Max 5x'; factor = 5; }
  else if (/max/i.test(tier) || caps.includes('claude_max')) { key = 'max'; label = 'Max'; factor = 5; }
  else if (/pro/i.test(tier) || caps.includes('claude_pro')) { key = 'pro'; label = 'Pro'; factor = 1; }
  else if (/free/i.test(tier)) { key = 'free'; label = 'Free'; factor = 0.2; }
  else if (caps.includes('raven') || org?.raven_type) { key = 'team'; label = 'Team'; factor = 1; }
  else if (caps.includes('chat')) { key = 'pro'; label = 'Pro'; factor = 1; }

  return { key, label, factor, tier };
}

// IPC: Quit app
ipcMain.on('quit-app', () => {
  app.quit();
});

// IPC: Toggle fullscreen
ipcMain.on('toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

ipcMain.handle('is-fullscreen', () => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

// ═══════════════════════════════════════════════
// Music Detection - Persistent PowerShell SMTC
// ═══════════════════════════════════════════════

let psProcess = null;
let psReady = false;
let psPendingResolve = null;
let psBuffer = '';

const SMTC_SCRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
  $at = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
  })[0]
  function AwaitOp($op, $type) {
    $t = $at.MakeGenericMethod($type).Invoke($null, @($op))
    $t.Wait(-1) | Out-Null
    return $t.Result
  }
  $mgr = AwaitOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  Write-Output 'READY'
  while ($true) {
    $cmd = [Console]::In.ReadLine()
    if ($cmd -eq $null -or $cmd -eq 'EXIT') { break }
    if ($cmd -ne 'GET') { continue }
    try {
      $s = $mgr.GetCurrentSession()
      if (-not $s) { Write-Output '{"status":"None"}'; continue }
      $mp = AwaitOp ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $ps2 = $s.GetPlaybackInfo().PlaybackStatus.ToString()
      $r = @{ title=[string]$mp.Title; artist=[string]$mp.Artist; album=[string]$mp.AlbumTitle; status=$ps2; thumb=''; thumbType='' }
      try {
        $tb = $mp.Thumbnail
        if ($tb) {
          $sr = AwaitOp ($tb.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
          $ns = [Windows.Storage.Streams.WindowsRuntimeStreamExtensions]::AsStream($sr)
          $ms2 = New-Object System.IO.MemoryStream
          $ns.CopyTo($ms2)
          $r.thumb = [Convert]::ToBase64String($ms2.ToArray())
          $r.thumbType = $sr.ContentType
          $ms2.Dispose(); $ns.Dispose(); $sr.Dispose()
        }
      } catch { }
      Write-Output ($r | ConvertTo-Json -Compress)
    } catch { Write-Output '{"status":"Error"}' }
  }
} catch {
  Write-Output 'READY'
  while ($true) {
    $cmd = [Console]::In.ReadLine()
    if ($cmd -eq $null -or $cmd -eq 'EXIT') { break }
    Write-Output '{"status":"Error","error":"SMTC not available"}'
  }
}
`;

function startSmtcProcess() {
  const scriptPath = path.join(os.tmpdir(), 'claude-usage-smtc.ps1');
  fs.writeFileSync(scriptPath, SMTC_SCRIPT, 'utf8');

  psProcess = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  psProcess.stdout.on('data', (data) => {
    psBuffer += data.toString();
    const lines = psBuffer.split('\n');
    psBuffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === 'READY') { psReady = true; continue; }
      if (psPendingResolve) {
        try { psPendingResolve(JSON.parse(trimmed)); }
        catch { psPendingResolve({ status: 'Error', error: 'Parse error' }); }
        psPendingResolve = null;
      }
    }
  });

  psProcess.stderr.on('data', () => {});
  psProcess.on('exit', () => { psProcess = null; psReady = false; });
}

ipcMain.handle('get-media-info', async () => {
  if (!psProcess || !psReady) return { status: 'None' };
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (psPendingResolve === resolveHandler) { psPendingResolve = null; resolve({ status: 'Error', error: 'Timeout' }); }
    }, 4000);
    const resolveHandler = (result) => { clearTimeout(timeout); resolve(result); };
    psPendingResolve = resolveHandler;
    psProcess.stdin.write('GET\n');
  });
});

// IPC: Fetch album art fallback - multi-source: Deezer → iTunes → MusicBrainz
ipcMain.handle('fetch-album-art', async (event, title, artist) => {
  const { net } = require('electron');

  // Clean search terms: remove feat., (remix), [live], etc.
  function cleanQuery(str) {
    if (!str) return '';
    return str
      .replace(/\s*[\(\[][^)\]]*[\)\]]\s*/g, ' ')  // remove (anything) and [anything]
      .replace(/\s*(feat\.?|ft\.?|featuring)\s+.*/i, '')  // remove feat. X
      .replace(/\s*[-–]\s*(official|music|lyric|audio|video).*/i, '')  // remove - Official Video etc.
      .replace(/[^\w\s]/g, ' ')  // remove special chars
      .replace(/\s+/g, ' ')
      .trim();
  }

  const cleanTitle = cleanQuery(title);
  const cleanArtist = cleanQuery(artist);

  // 1. Try Deezer (best coverage, no API key needed)
  try {
    const q = encodeURIComponent(`${cleanArtist} ${cleanTitle}`);
    const resp = await net.fetch(`https://api.deezer.com/search?q=${q}&limit=3`);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.data && data.data.length > 0) {
        // Find best match - prefer exact artist match
        const lowerArtist = cleanArtist.toLowerCase();
        const match = data.data.find(r =>
          r.artist && r.artist.name.toLowerCase().includes(lowerArtist)
        ) || data.data[0];
        const artUrl = match.album && (match.album.cover_xl || match.album.cover_big || match.album.cover_medium);
        if (artUrl) return { url: artUrl };
      }
    }
  } catch {}

  // 2. Fallback: iTunes
  try {
    const q = encodeURIComponent(`${cleanArtist} ${cleanTitle}`);
    const resp = await net.fetch(`https://itunes.apple.com/search?term=${q}&media=music&limit=3`);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.results && data.results.length > 0) {
        const lowerArtist = cleanArtist.toLowerCase();
        const match = data.results.find(r =>
          r.artistName && r.artistName.toLowerCase().includes(lowerArtist)
        ) || data.results[0];
        const artUrl = match.artworkUrl100;
        if (artUrl) return { url: artUrl.replace('100x100bb', '600x600bb') };
      }
    }
  } catch {}

  // 3. Last resort: try with just the title (handles cases where artist name is different)
  if (cleanArtist) {
    try {
      const q = encodeURIComponent(cleanTitle);
      const resp = await net.fetch(`https://api.deezer.com/search?q=${q}&limit=1`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.data && data.data.length > 0) {
          const artUrl = data.data[0].album && (data.data[0].album.cover_xl || data.data[0].album.cover_big);
          if (artUrl) return { url: artUrl };
        }
      }
    } catch {}
  }

  return null;
});

// App lifecycle
app.whenReady().then(async () => {
  let sessionKey = null;
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = store.get('sessionKey_encrypted');
    if (encrypted) {
      try {
        sessionKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (err) {}
    }
  } else {
    sessionKey = store.get('sessionKey');
  }
  if (sessionKey) await setSessionCookie(sessionKey);

  startSmtcProcess();
  createMainWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  if (psProcess) {
    try { psProcess.stdin.write('EXIT\n'); } catch {}
    psProcess.kill();
    psProcess = null;
  }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
