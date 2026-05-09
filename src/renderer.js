// ═══════════════════════════════════════════════
// Deep Space Starfield
// ═══════════════════════════════════════════════

const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');

let stars = [];
const STAR_COUNT = 200;
const SPEED = 0.4;
let centerX, centerY;

// Bass-reactive state (set by music system)
let bassSmooth = 0;
let bassLevel = 0;
let peakBass = 0;
let themeColor = null; // { r, g, b } from album art
let shakeY = 0;
let shakeVelocity = 0;
let bassAvg = 0;
let bassHit = 0;
let glowColor = localStorage.getItem('glowColor') || 'auto';
let bassGlowEnabled = localStorage.getItem('bassGlowEnabled') !== 'false';

// Music state (must be before animateStarfield runs)
let currentMedia = null;
let mediaPollingInterval = null;
let audioStream = null;
let audioCtx = null;
let analyser = null;
let lastMediaKey = '';
let audioCaptureActive = false;
let bassFreqData = null;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  centerX = canvas.width / 2;
  centerY = canvas.height / 2;
}

function createStar(randomDepth) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * Math.max(canvas.width, canvas.height) * 0.9;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z: randomDepth ? Math.random() * 1200 : 1200,
    prevX: 0, prevY: 0,
    hue: Math.random() < 0.12 ? (Math.random() < 0.5 ? 220 : 40) : 0,
    brightness: 0.5 + Math.random() * 0.5
  };
}

function initStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) stars.push(createStar(true));
}

function updateStars() {
  // Bass multiplier: stars accelerate on bass hits
  const bassSpeedMult = 1 + bassSmooth * 4;

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    s.prevX = (s.x / s.z) * 500 + centerX;
    s.prevY = (s.y / s.z) * 500 + centerY;
    s.z -= SPEED * 2 * bassSpeedMult;
    if (s.z <= 1) { stars[i] = createStar(false); continue; }
    const sx = (s.x / s.z) * 500 + centerX;
    const sy = (s.y / s.z) * 500 + centerY;
    if (sx < -100 || sx > canvas.width + 100 || sy < -100 || sy > canvas.height + 100) {
      stars[i] = createStar(false);
    }
  }
}

function drawStars() {
  // Faster trail fade on bass for sharper streaks
  const trailFade = 0.2 + bassSmooth * 0.12;
  ctx.fillStyle = `rgba(0, 0, 0, ${trailFade})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Bass glow multiplier for star size and brightness
  const bassGlow = 1 + bassSmooth * 0.8;

  for (const s of stars) {
    const sx = (s.x / s.z) * 500 + centerX;
    const sy = (s.y / s.z) * 500 + centerY;
    const depth = 1 - s.z / 1200;
    const size = Math.max(0.2, depth * 2.8 * bassGlow);
    const alpha = Math.min(1, depth * 1.4 * bassGlow) * s.brightness;

    // Fade out stars near center so text is readable
    const dx = (sx - centerX) / canvas.width;
    const dy = (sy - centerY) / canvas.height;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
    const centerFade = Math.min(1, Math.max(0, (distFromCenter - 0.08) / 0.2));
    if (centerFade < 0.01) continue;

    const fadedAlpha = alpha * centerFade;

    if (depth > 0.55) {
      const streakAlpha = (depth - 0.55) * 1.8 * s.brightness * centerFade;
      ctx.beginPath();
      ctx.moveTo(s.prevX, s.prevY);
      ctx.lineTo(sx, sy);
      ctx.strokeStyle = s.hue
        ? `hsla(${s.hue}, 50%, 80%, ${streakAlpha * 0.3})`
        : `rgba(180, 190, 220, ${streakAlpha * 0.3})`;
      ctx.lineWidth = size * 0.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fillStyle = s.hue
      ? `hsla(${s.hue}, 50%, 85%, ${fadedAlpha})`
      : `rgba(210, 215, 235, ${fadedAlpha})`;
    ctx.fill();

    if (depth > 0.7 && size > 1.8) {
      ctx.beginPath();
      ctx.arc(sx, sy, size * 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 210, 240, ${fadedAlpha * 0.04})`;
      ctx.fill();
    }
  }

  // Black radial gradient overlay in center for text readability
  const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(canvas.width, canvas.height) * 0.35);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
  grad.addColorStop(0.4, 'rgba(0, 0, 0, 0.7)');
  grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.2)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Bass corner glow - colored pulse from corners on heavy bass
  if (bassGlowEnabled && bassSmooth > 0.06) {
    const bAlpha = bassSmooth * 0.18;
    const gc = getGlowRGB();
    const w = canvas.width, h = canvas.height;
    const cornerRadius = Math.max(w, h) * 0.5;
    const corners = [[0, 0], [w, 0], [0, h], [w, h]];
    for (const [cx, cy] of corners) {
      const cg2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, cornerRadius);
      cg2.addColorStop(0, `rgba(${gc.r}, ${gc.g}, ${gc.b}, ${bAlpha})`);
      cg2.addColorStop(0.4, `rgba(${gc.r}, ${gc.g}, ${gc.b}, ${bAlpha * 0.3})`);
      cg2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = cg2;
      ctx.fillRect(0, 0, w, h);
    }
  }
}

function animateStarfield() {
  updateBassLevel();
  updateScreenShake();
  updateStars();
  drawStars();
  requestAnimationFrame(animateStarfield);
}

resizeCanvas();
initStars();
animateStarfield();
window.addEventListener('resize', resizeCanvas);

// ═══════════════════════════════════════════════
// DOM & State
// ═══════════════════════════════════════════════

const dom = {
  loadingScreen: document.getElementById('loadingScreen'),
  loginScreen: document.getElementById('loginScreen'),
  mainScreen: document.getElementById('mainScreen'),
  autoDetectBtn: document.getElementById('autoDetectBtn'),
  autoDetectError: document.getElementById('autoDetectError'),
  sessionKeyInput: document.getElementById('sessionKeyInput'),
  connectBtn: document.getElementById('connectBtn'),
  sessionKeyError: document.getElementById('sessionKeyError'),
  sessionPct: document.getElementById('sessionPct'),
  sessionBar: document.getElementById('sessionBar'),
  sessionBarWrap: document.getElementById('sessionBarWrap'),
  sessionCountdown: document.getElementById('sessionCountdown'),
  sessionResetTime: document.getElementById('sessionResetTime'),
  usageLabel: document.querySelector('.usage-label'),
  weeklySection: document.getElementById('weeklySection'),
  weeklyPct: document.getElementById('weeklyPct'),
  weeklyBar: document.getElementById('weeklyBar'),
  weeklyCountdown: document.getElementById('weeklyCountdown'),
  weeklyResetTime: document.getElementById('weeklyResetTime'),
  cornerPulse: document.getElementById('cornerPulse'),
  refreshBtn: document.getElementById('refreshBtn'),
  quitBtn: document.getElementById('quitBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  statusLine: document.getElementById('statusLine'),
  musicWidget: document.getElementById('musicWidget'),
  musicArt: document.getElementById('musicArt'),
  musicTitle: document.getElementById('musicTitle'),
  musicArtist: document.getElementById('musicArtist')
};

let credentials = null;
let usageData = null;
let countdownInterval = null;
let autoRefreshInterval = null;
let isFetching = false;
let showWeekly = localStorage.getItem('showWeekly') === 'true';
let moneyMode = localStorage.getItem('moneyMode') === 'true';
let musicEnabled = localStorage.getItem('musicEnabled') === 'true';

// Money mode state - accumulates across sessions
let totalMoney = parseFloat(localStorage.getItem('totalMoney')) || 0;
let lastSessionPct = parseFloat(localStorage.getItem('lastSessionPct')) || 0;
let displayedMoney = totalMoney;
let targetMoney = totalMoney;
let burnRate = 0;
let lastPct = 0;
let lastPctTime = 0;
let moneyTickRunning = false;

// Estimated API cost per full session (100%) in dollars
// Claude Opus 4.6 with 1M context window:
//   Input: $15/MTok - each message with full context ≈ $15
//   Output: $75/MTok - avg response ≈ $2-4
//   100% session ≈ 100+ exchanges ≈ $1,800 in real API costs
// This is the actual compute cost Anthropic subsidizes behind the subscription
const DEFAULT_COST_PER_SESSION = 1800;
let COST_PER_SESSION = parseFloat(localStorage.getItem('costPerSession')) || DEFAULT_COST_PER_SESSION;

const WARN = 75;
const DANGER = 90;
const REFRESH_MS = 30 * 1000; // 30 seconds for near-realtime updates

// ═══════════════════════════════════════════════
// Screens
// ═══════════════════════════════════════════════

function showScreen(name) {
  dom.loadingScreen.style.display = 'none';
  dom.loginScreen.style.display = 'none';
  dom.mainScreen.style.display = 'none';
  if (name === 'loading') dom.loadingScreen.style.display = 'flex';
  if (name === 'login') dom.loginScreen.style.display = 'flex';
  if (name === 'main') dom.mainScreen.style.display = 'flex';
}

// ═══════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════

async function init() {
  setupEvents();
  credentials = await window.electronAPI.getCredentials();

  // Restore saved toggle states
  if (showWeekly) {
    dom.weeklySection.style.display = 'block';
  }
  if (moneyMode) {
    applyMoneyMode();
  }
  if (musicEnabled) {
    startMediaPolling();
    startAudioCapture();
  }

  if (credentials.sessionKey && credentials.organizationId) {
    showScreen('main');
    await fetchUsageData();
    startAutoRefresh();
  } else {
    showScreen('login');
  }
}

function setupEvents() {
  dom.autoDetectBtn.addEventListener('click', handleAutoDetect);
  dom.connectBtn.addEventListener('click', handleConnect);
  dom.sessionKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleConnect();
    dom.sessionKeyError.textContent = '';
  });

  dom.refreshBtn.addEventListener('click', async () => {
    dom.refreshBtn.classList.add('spinning');
    await fetchUsageData();
    dom.refreshBtn.classList.remove('spinning');
  });

  dom.settingsBtn.addEventListener('click', toggleSettings);

  dom.quitBtn.addEventListener('click', () => {
    window.electronAPI.quitApp();
  });

  // Bar collapse toggle
  const barToggleBtn = document.getElementById('barToggleBtn');
  const controlsBar = document.getElementById('controlsBar');
  const barCollapsed = localStorage.getItem('barCollapsed') === 'true';
  if (barCollapsed) controlsBar.classList.add('collapsed');

  barToggleBtn.addEventListener('click', () => {
    controlsBar.classList.toggle('collapsed');
    localStorage.setItem('barCollapsed', controlsBar.classList.contains('collapsed'));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11' || (e.altKey && e.key === 'Enter')) {
      e.preventDefault();
      window.electronAPI.toggleFullscreen();
    }
  });
}

function showResetConfirm() {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-title">Reset spending counter?</div>
      <div class="confirm-text">This will reset your accumulated total of $${formatMoney(totalMoney)} back to zero. This cannot be undone.</div>
      <div class="confirm-buttons">
        <button class="confirm-cancel" id="confirmCancel">Cancel</button>
        <button class="confirm-danger" id="confirmReset">Reset</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('confirmCancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('confirmReset').addEventListener('click', () => {
    totalMoney = 0;
    targetMoney = 0;
    displayedMoney = 0;
    lastSessionPct = 0;
    burnRate = 0;
    localStorage.setItem('totalMoney', '0');
    localStorage.setItem('lastSessionPct', '0');
    renderMoneyDisplay();
    overlay.remove();
  });
}

// ═══════════════════════════════════════════════
// Color Picker
// ═══════════════════════════════════════════════

let fontColor = localStorage.getItem('fontColor') || '#ffffff';
let fontSize = parseInt(localStorage.getItem('fontSize')) || 100; // percentage scale (50-200)
let colorPopup = null;

function applyFontColor(color) {
  fontColor = color;
  localStorage.setItem('fontColor', color);
  // Only apply if music theming isn't overriding
  if (!musicEnabled || !themeColor || !currentMedia || currentMedia.status !== 'Playing') {
    dom.sessionPct.style.color = color;
  }
}

function getGlowRGB() {
  if (glowColor === 'auto' && themeColor) return themeColor;
  if (glowColor !== 'auto' && /^#[0-9a-fA-F]{6}$/.test(glowColor)) {
    return {
      r: parseInt(glowColor.slice(1, 3), 16),
      g: parseInt(glowColor.slice(3, 5), 16),
      b: parseInt(glowColor.slice(5, 7), 16)
    };
  }
  return { r: 100, g: 100, b: 255 };
}

function applyFontSize(size) {
  fontSize = size;
  localStorage.setItem('fontSize', size);
  dom.sessionPct.style.fontSize = `calc(${size / 100} * ${moneyMode ? 'clamp(64px, 12vw, 280px)' : 'clamp(72px, 14vw, 320px)'})`;
  document.documentElement.style.setProperty('--font-scale', size / 100);
}

// Apply saved settings on startup
setTimeout(() => {
  dom.sessionPct.style.color = fontColor;
  document.documentElement.style.setProperty('--font-scale', fontSize / 100);
  if (fontSize !== 100) applyFontSize(fontSize);
}, 0);

// ═══════════════════════════════════════════════
// Unified Settings Popup
// ═══════════════════════════════════════════════

let settingsPopup = null;

function toggleSettings() {
  if (settingsPopup) { settingsPopup.remove(); settingsPopup = null; return; }

  const presets = ['#ffffff', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c'];
  const glowPresets = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c'];

  const popup = document.createElement('div');
  popup.className = 'settings-popup';

  let html = `
    <div class="settings-section">
      <div class="settings-title">Features</div>
      <div class="settings-row"><span class="settings-label">Music Visualization</span><div class="toggle-switch${musicEnabled ? ' active' : ''}" data-toggle="music"></div></div>
      <div class="settings-row"><span class="settings-label">Bass Corner Glow</span><div class="toggle-switch${bassGlowEnabled ? ' active' : ''}" data-toggle="bassGlow"></div></div>
      <div class="settings-row"><span class="settings-label">Money Mode</span><div class="toggle-switch${moneyMode ? ' active' : ''}" data-toggle="money"></div></div>
      <div class="settings-row"><span class="settings-label">Weekly View</span><div class="toggle-switch${showWeekly ? ' active' : ''}" data-toggle="weekly"></div></div>
    </div>

    <div class="settings-section">
      <div class="settings-title">Bass Glow Color</div>
      <div class="color-presets">
        <div class="color-swatch glow-swatch${glowColor === 'auto' ? ' active' : ''}" data-glow="auto" style="background:linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6);position:relative;overflow:hidden;">
          <span style="font-size:9px;color:#fff;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:600;">A</span>
        </div>
        ${glowPresets.map(c => `<div class="color-swatch glow-swatch${glowColor === c ? ' active' : ''}" data-glow="${c}" style="background:${c}"></div>`).join('')}
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-title">Font</div>
      <div class="color-presets" style="margin-bottom:10px;">
        ${presets.map(c => `<div class="color-swatch font-swatch${c === fontColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
      </div>
      <div class="color-hex-row" style="margin-bottom:14px;">
        <input type="text" class="color-hex-input font-hex" value="${fontColor}" placeholder="#ffffff" maxlength="7" />
        <button class="color-apply-btn font-apply-btn">Apply</button>
      </div>
      <div class="settings-row">
        <span class="settings-label">Size</span>
        <span class="font-size-val" style="min-width:40px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:rgba(255,255,255,0.5);">${fontSize}%</span>
      </div>
      <div class="font-size-row" style="margin-top:4px;">
        <input type="range" class="font-size-slider" min="50" max="200" step="5" value="${fontSize}" />
      </div>
    </div>`;

  if (moneyMode) {
    html += `
    <div class="settings-section">
      <div class="settings-title">Money Config</div>
      <div class="settings-row" style="gap:8px;">
        <span class="settings-label" style="white-space:nowrap;">$/session</span>
        <div class="color-hex-row" style="flex:1;">
          <input type="number" class="color-hex-input rate-input" value="${COST_PER_SESSION}" min="1" step="50" style="width:80px;" />
          <button class="color-apply-btn rate-apply">Set</button>
        </div>
      </div>
      <div class="settings-row" style="gap:8px;">
        <span class="settings-label" style="white-space:nowrap;">Start $</span>
        <div class="color-hex-row" style="flex:1;">
          <input type="number" class="color-hex-input start-input" value="${totalMoney.toFixed(2)}" min="0" step="10" style="width:80px;" />
          <button class="color-apply-btn start-apply">Set</button>
        </div>
      </div>
      <button class="settings-action-btn danger" id="settingsResetMoney" style="width:100%;margin-top:8px;">Reset Spending Counter</button>
    </div>`;
  }

  html += `
    <div class="settings-section" style="border:none;margin:0;padding:0;">
      <div class="settings-actions">
        <button class="settings-action-btn" id="settingsFullscreen">Fullscreen</button>
        <button class="settings-action-btn danger" id="settingsLogout">Log out</button>
      </div>
    </div>`;

  popup.innerHTML = html;
  document.body.appendChild(popup);
  settingsPopup = popup;

  // ── Toggle switches ──
  popup.querySelectorAll('.toggle-switch').forEach(sw => {
    sw.addEventListener('click', () => {
      const key = sw.dataset.toggle;
      sw.classList.toggle('active');
      const on = sw.classList.contains('active');

      if (key === 'music') {
        musicEnabled = on;
        localStorage.setItem('musicEnabled', on);
        if (on) { startMediaPolling(); startAudioCapture(); }
        else { stopMediaPolling(); stopAudioCapture(); hideNowPlaying(); bassLevel = 0; bassSmooth = 0; peakBass = 0; themeColor = null; shakeY = 0; dom.sessionPct.style.color = fontColor; dom.sessionPct.style.textShadow = ''; }
      } else if (key === 'bassGlow') {
        bassGlowEnabled = on;
        localStorage.setItem('bassGlowEnabled', on);
      } else if (key === 'money') {
        moneyMode = on;
        localStorage.setItem('moneyMode', on);
        applyMoneyMode();
        if (on) { targetMoney = totalMoney; displayedMoney = totalMoney; renderMoneyDisplay(); }
        // Rebuild popup to show/hide money config
        settingsPopup.remove(); settingsPopup = null; toggleSettings();
      } else if (key === 'weekly') {
        showWeekly = on;
        localStorage.setItem('showWeekly', on);
        dom.weeklySection.style.display = on ? 'block' : 'none';
        if (on && usageData) updateWeeklyUI();
      }
    });
  });

  // ── Glow color swatches ──
  popup.querySelectorAll('.glow-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      glowColor = sw.dataset.glow;
      localStorage.setItem('glowColor', glowColor);
      popup.querySelectorAll('.glow-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
    });
  });

  // ── Font color swatches ──
  popup.querySelectorAll('.font-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      applyFontColor(sw.dataset.color);
      popup.querySelectorAll('.font-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      popup.querySelector('.font-hex').value = sw.dataset.color;
    });
  });

  // Font hex input
  const fontHex = popup.querySelector('.font-hex');
  const fontApply = popup.querySelector('.font-apply-btn');
  fontApply.addEventListener('click', () => {
    let hex = fontHex.value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      applyFontColor(hex);
      popup.querySelectorAll('.font-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === hex));
    }
  });
  fontHex.addEventListener('keydown', (e) => { if (e.key === 'Enter') fontApply.click(); });

  // Font size slider
  const slider = popup.querySelector('.font-size-slider');
  const sizeLabel = popup.querySelector('.font-size-val');
  slider.addEventListener('input', () => {
    const val = parseInt(slider.value);
    sizeLabel.textContent = `${val}%`;
    applyFontSize(val);
  });

  // ── Money config ──
  const rateApply = popup.querySelector('.rate-apply');
  if (rateApply) {
    const rateInput = popup.querySelector('.rate-input');
    rateApply.addEventListener('click', () => {
      const val = parseFloat(rateInput.value);
      if (val > 0) { COST_PER_SESSION = val; localStorage.setItem('costPerSession', val); }
    });
    rateInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') rateApply.click(); });
  }

  const startApply = popup.querySelector('.start-apply');
  if (startApply) {
    const startInput = popup.querySelector('.start-input');
    startApply.addEventListener('click', () => {
      const val = parseFloat(startInput.value);
      if (!isNaN(val) && val >= 0) {
        totalMoney = val; targetMoney = val; displayedMoney = val;
        localStorage.setItem('totalMoney', val.toFixed(4));
        if (moneyMode) renderMoneyDisplay();
      }
    });
    startInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startApply.click(); });
  }

  const resetBtn = popup.querySelector('#settingsResetMoney');
  if (resetBtn) resetBtn.addEventListener('click', () => { settingsPopup.remove(); settingsPopup = null; showResetConfirm(); });

  // ── Actions ──
  popup.querySelector('#settingsFullscreen').addEventListener('click', () => window.electronAPI.toggleFullscreen());
  popup.querySelector('#settingsLogout').addEventListener('click', async () => {
    await window.electronAPI.deleteCredentials();
    credentials = { sessionKey: null, organizationId: null };
    stopAutoRefresh();
    if (countdownInterval) clearInterval(countdownInterval);
    showScreen('login');
    settingsPopup.remove(); settingsPopup = null;
  });

  // Close on click outside
  const closeHandler = (e) => {
    if (!popup.contains(e.target) && e.target !== dom.settingsBtn) {
      popup.remove(); settingsPopup = null;
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

// ═══════════════════════════════════════════════
// Money Mode
// ═══════════════════════════════════════════════

function applyMoneyMode() {
  if (moneyMode) {
    dom.sessionBarWrap.style.display = 'none';
    dom.usageLabel.textContent = 'TOTAL SPENT';
    renderMoneyDisplay();
    startMoneyTick();
  } else {
    dom.sessionBarWrap.style.display = '';
    dom.usageLabel.textContent = 'CURRENT SESSION';
    stopMoneyTick();
    if (usageData) updateSessionUI();
  }
  // Re-apply font size for the correct mode
  if (fontSize !== 100) applyFontSize(fontSize);
}

function formatMoney(amount) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderMoneyDisplay() {
  const whole = Math.floor(displayedMoney);
  const cents = Math.abs(displayedMoney % 1 * 100).toFixed(0).padStart(2, '0');
  const wholeFormatted = whole.toLocaleString('en-US');

  // Build digit spans for smooth individual digit transitions
  const dollarStr = `$${wholeFormatted}`;
  const centsStr = `.${cents}`;

  let html = '';
  for (const ch of dollarStr) {
    if (ch >= '0' && ch <= '9') {
      html += `<span class="money-digit">${ch}</span>`;
    } else {
      html += `<span class="money-sep">${ch}</span>`;
    }
  }
  html += `<span class="money-cents">${centsStr}</span>`;

  dom.sessionPct.innerHTML = html;
  dom.sessionPct.className = 'usage-pct money-mode';
}

// Called when new usage data arrives - accumulates cost and recalculates burn rate
function onNewUsageData(newPct) {
  const now = Date.now();

  // Detect session reset (utilization dropped significantly)
  if (newPct < lastSessionPct - 10) {
    // Session reset happened - the old session's cost is already accumulated
    // Start tracking new session from current pct
    lastSessionPct = 0;
  }

  // Calculate delta cost since last known session percentage
  if (newPct > lastSessionPct) {
    const deltaPct = newPct - lastSessionPct;
    const deltaMoney = deltaPct / 100 * COST_PER_SESSION;
    totalMoney += deltaMoney;
    localStorage.setItem('totalMoney', totalMoney.toFixed(4));
  }

  // Calculate burn rate for realtime ticking
  if (lastPctTime > 0 && newPct > lastPct) {
    const elapsed = (now - lastPctTime) / 1000;
    const deltaPct = newPct - lastPct;
    burnRate = (deltaPct / 100 * COST_PER_SESSION) / elapsed;
  } else if (newPct <= lastPct) {
    burnRate = 0;
  }

  lastSessionPct = newPct;
  localStorage.setItem('lastSessionPct', lastSessionPct.toFixed(4));
  lastPct = newPct;
  lastPctTime = now;
  targetMoney = totalMoney;

  // In money mode the tick loop handles smooth animation
  // In pct mode we don't touch the display here (updateSessionUI does it)
  updateCornerPulse(newPct);
}

// Continuous tick - smooth lerp animation + burn rate between refreshes
let lastTickTime = 0;
const LERP_SPEED = 8; // Higher = faster catch-up (smooth exponential ease)

function moneyTick(now) {
  if (!moneyTickRunning) return;

  if (lastTickTime > 0) {
    const dt = (now - lastTickTime) / 1000;

    // Cap dt to avoid huge jumps if tab was backgrounded
    if (dt < 2) {
      // Add burn rate to target (continuous spending estimate)
      if (burnRate > 0) {
        targetMoney += burnRate * dt;
        totalMoney = targetMoney;
      }

      // Smooth lerp: displayedMoney chases targetMoney
      const diff = targetMoney - displayedMoney;
      if (Math.abs(diff) > 0.001) {
        // Exponential ease-out - fast start, smooth finish
        displayedMoney += diff * (1 - Math.exp(-LERP_SPEED * dt));
        renderMoneyDisplay();
      } else if (Math.abs(diff) > 0) {
        // Snap when close enough to avoid infinite approach
        displayedMoney = targetMoney;
        renderMoneyDisplay();
      }
    }
  }
  lastTickTime = now;

  requestAnimationFrame(moneyTick);
}

function startMoneyTick() {
  if (moneyTickRunning) return;
  moneyTickRunning = true;
  lastTickTime = 0;
  requestAnimationFrame(moneyTick);
}

function stopMoneyTick() {
  moneyTickRunning = false;
  lastTickTime = 0;
  // Save accumulated total when stopping
  localStorage.setItem('totalMoney', totalMoney.toFixed(4));
}

// ═══════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════

async function handleAutoDetect() {
  dom.autoDetectBtn.disabled = true;
  dom.autoDetectBtn.textContent = 'Waiting...';
  dom.autoDetectError.textContent = '';

  try {
    const result = await window.electronAPI.detectSessionKey();
    if (!result.success) {
      dom.autoDetectError.textContent = result.error || 'Login failed';
      return;
    }

    dom.autoDetectBtn.textContent = 'Validating...';
    const validation = await window.electronAPI.validateSessionKey(result.sessionKey);

    if (validation.success) {
      credentials = { sessionKey: result.sessionKey, organizationId: validation.organizationId };
      await window.electronAPI.saveCredentials(credentials);
      showScreen('main');
      await fetchUsageData();
      startAutoRefresh();
    } else {
      dom.autoDetectError.textContent = 'Session invalid. Try again.';
    }
  } catch (error) {
    dom.autoDetectError.textContent = error.message || 'Login failed';
  } finally {
    dom.autoDetectBtn.disabled = false;
    dom.autoDetectBtn.innerHTML = '<span class="btn-icon">\u2192</span> Log in with Claude';
  }
}

async function handleConnect() {
  const key = dom.sessionKeyInput.value.trim();
  if (!key) { dom.sessionKeyError.textContent = 'Paste your session key'; return; }

  dom.connectBtn.disabled = true;
  dom.connectBtn.textContent = '...';
  dom.sessionKeyError.textContent = '';

  try {
    const result = await window.electronAPI.validateSessionKey(key);
    if (result.success) {
      credentials = { sessionKey: key, organizationId: result.organizationId };
      await window.electronAPI.saveCredentials(credentials);
      dom.sessionKeyInput.value = '';
      showScreen('main');
      await fetchUsageData();
      startAutoRefresh();
    } else {
      dom.sessionKeyError.textContent = result.error || 'Invalid session key';
    }
  } catch (error) {
    dom.sessionKeyError.textContent = 'Connection failed';
  } finally {
    dom.connectBtn.disabled = false;
    dom.connectBtn.textContent = 'Connect';
  }
}

// ═══════════════════════════════════════════════
// Fetch
// ═══════════════════════════════════════════════

async function fetchUsageData() {
  if (isFetching) return;
  isFetching = true;
  dom.statusLine.textContent = 'Fetching...';
  dom.statusLine.style.opacity = '1';

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      usageData = await window.electronAPI.fetchUsageData();
      const newPct = usageData.five_hour?.utilization || 0;

      // Always track spending data regardless of mode
      onNewUsageData(newPct);

      // Always update timers (resets_at / countdown)
      updateTimers();

      if (!moneyMode) {
        updateSessionUI();
      }

      if (showWeekly) updateWeeklyUI();
      startCountdown();

      const now = new Date();
      dom.statusLine.textContent = `Updated ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      setTimeout(() => { dom.statusLine.style.opacity = '0.3'; }, 2000);
      break; // Success, stop retrying
    } catch (error) {
      if (error.message.includes('SessionExpired') || error.message.includes('Unauthorized')) {
        credentials = { sessionKey: null, organizationId: null };
        showScreen('login');
        break;
      }
      if (attempt < MAX_RETRIES) {
        dom.statusLine.textContent = `Retrying... (${attempt + 1})`;
        await new Promise(r => setTimeout(r, 1500));
      } else {
        dom.statusLine.textContent = 'Failed to fetch';
      }
    }
  }
  isFetching = false;
}

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(async () => {
    dom.refreshBtn.classList.add('spinning');
    await fetchUsageData();
    dom.refreshBtn.classList.remove('spinning');
  }, REFRESH_MS);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; }
}

// ═══════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════

function updateTimers() {
  if (!usageData) return;
  const resetsAt = usageData.five_hour?.resets_at;
  dom.sessionResetTime.textContent = formatResetTime(resetsAt);
  dom.sessionCountdown.textContent = formatCountdown(resetsAt);
}

function updateSessionUI() {
  if (!usageData) return;

  const pct = Math.round(usageData.five_hour?.utilization || 0);
  const resetsAt = usageData.five_hour?.resets_at;

  dom.sessionPct.textContent = `${pct}%`;
  dom.sessionPct.className = 'usage-pct';
  if (pct >= DANGER) dom.sessionPct.classList.add('danger');
  else if (pct >= WARN) dom.sessionPct.classList.add('warning');

  dom.sessionBar.style.width = `${Math.min(pct, 100)}%`;
  dom.sessionBar.className = 'usage-bar-fill';
  if (pct >= DANGER) dom.sessionBar.classList.add('danger');
  else if (pct >= WARN) dom.sessionBar.classList.add('warning');

  dom.sessionResetTime.textContent = formatResetTime(resetsAt);
  dom.sessionCountdown.textContent = formatCountdown(resetsAt);

  // Red corner pulse when out of usage (95%+)
  updateCornerPulse(pct);
}

function updateCornerPulse(pct) {
  dom.cornerPulse.style.display = pct >= 95 ? 'block' : 'none';
}

function updateWeeklyUI() {
  if (!usageData) return;

  const pct = Math.round(usageData.seven_day?.utilization || 0);
  const resetsAt = usageData.seven_day?.resets_at;

  dom.weeklyPct.textContent = `${pct}%`;
  dom.weeklyPct.className = 'weekly-pct';
  if (pct >= DANGER) dom.weeklyPct.classList.add('danger');
  else if (pct >= WARN) dom.weeklyPct.classList.add('warning');

  dom.weeklyBar.style.width = `${Math.min(pct, 100)}%`;
  dom.weeklyBar.className = 'usage-bar-fill weekly';
  if (pct >= DANGER) dom.weeklyBar.classList.add('danger');
  else if (pct >= WARN) dom.weeklyBar.classList.add('warning');

  dom.weeklyResetTime.textContent = formatResetTime(resetsAt);
  dom.weeklyCountdown.textContent = formatCountdown(resetsAt);
}

function formatResetTime(resetsAt) {
  if (!resetsAt) return '\u2014';
  const d = new Date(resetsAt);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;

  const now = new Date();
  const diffDays = (d - now) / (1000 * 60 * 60 * 24);

  if (diffDays > 1) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}, ${h12}:${m} ${ampm}`;
  }
  return `${h12}:${m} ${ampm}`;
}

function formatCountdown(resetsAt) {
  if (!resetsAt) return '\u2014';
  const diff = new Date(resetsAt) - new Date();
  if (diff <= 0) return 'Resetting...';

  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  if (hrs >= 24) {
    const days = Math.floor(hrs / 24);
    return `${days}d ${hrs % 24}h ${mins}m`;
  }
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

function updateCountdowns() {
  if (!usageData) return;

  dom.sessionCountdown.textContent = formatCountdown(usageData.five_hour?.resets_at);
  if (showWeekly) {
    dom.weeklyCountdown.textContent = formatCountdown(usageData.seven_day?.resets_at);
  }

  const resets = usageData.five_hour?.resets_at;
  if (resets) {
    const diff = new Date(resets) - new Date();
    if (diff <= 0 && diff > -5000) {
      setTimeout(() => fetchUsageData(), 3000);
    }
  }
}

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(updateCountdowns, 1000);
}

// ═══════════════════════════════════════════════
// Music Visualization
// ═══════════════════════════════════════════════

// Toggle music on/off
function toggleMusic() {
  musicEnabled = !musicEnabled;
  localStorage.setItem('musicEnabled', musicEnabled);

  if (musicEnabled) {
    startMediaPolling();
    startAudioCapture();
  } else {
    stopMediaPolling();
    stopAudioCapture();
    hideNowPlaying();
    bassLevel = 0;
    bassSmooth = 0;
    peakBass = 0;
    themeColor = null;
    shakeY = 0;
    dom.sessionPct.style.color = fontColor;
    dom.sessionPct.style.textShadow = '';
  }
}

// ── Media Polling (SMTC) ──

function startMediaPolling() {
  pollMediaInfo();
  mediaPollingInterval = setInterval(pollMediaInfo, 2500);
}

function stopMediaPolling() {
  if (mediaPollingInterval) {
    clearInterval(mediaPollingInterval);
    mediaPollingInterval = null;
  }
}

async function pollMediaInfo() {
  try {
    const info = await window.electronAPI.getMediaInfo();

    if (!info || info.status === 'None' || info.status === 'Error') {
      if (currentMedia) {
        currentMedia = null;
        hideNowPlaying();
        themeColor = null;
        dom.sessionPct.style.color = fontColor;
        dom.sessionPct.style.textShadow = '';
      }
      return;
    }

    const mediaKey = `${info.title}|${info.artist}`;
    const songChanged = mediaKey !== lastMediaKey;
    lastMediaKey = mediaKey;
    currentMedia = info;

    showNowPlaying(info, songChanged);

    if (songChanged && info.thumb) {
      extractThemeColor(info.thumb, info.thumbType);
    }
  } catch (e) {
    // Silently fail - music detection is optional
  }
}

function showNowPlaying(info, songChanged) {
  dom.musicWidget.classList.add('visible');
  dom.musicWidget.classList.toggle('paused', info.status !== 'Playing');

  if (songChanged) {
    dom.musicTitle.textContent = info.title || 'Unknown';
    dom.musicArtist.textContent = info.artist || 'Unknown Artist';
  }

  const placeholder = document.getElementById('musicArtPlaceholder');

  if (songChanged || (info.thumb && dom.musicArt.style.display !== 'block')) {
    if (info.thumb) {
      const mimeType = info.thumbType || 'image/jpeg';
      dom.musicArt.src = `data:${mimeType};base64,${info.thumb}`;
      dom.musicArt.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      dom.musicArt.style.display = 'none';
      placeholder.style.display = 'flex';
      // Try fetching art from web if SMTC didn't provide it
      if (songChanged && info.title) {
        fetchAlbumArt(info.title, info.artist);
      }
    }
  }

  // Apply theme color to widget border
  if (themeColor && info.status === 'Playing') {
    const { r, g, b } = themeColor;
    dom.musicWidget.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
    dom.musicWidget.style.boxShadow = `0 0 20px rgba(${r}, ${g}, ${b}, 0.06)`;
    dom.musicTitle.style.color = `rgb(${r}, ${g}, ${b})`;
  }
}

function hideNowPlaying() {
  dom.musicWidget.classList.remove('visible');
  dom.musicWidget.style.borderColor = '';
  dom.musicWidget.style.boxShadow = '';
  dom.musicTitle.style.color = '';
  lastMediaKey = '';
  currentMedia = null;
}

// ── Album Art Fallback (web fetch) ──

let artFetchCache = {}; // cache by "title|artist"

async function fetchAlbumArt(title, artist) {
  const key = `${title}|${artist}`;
  if (artFetchCache[key] !== undefined) {
    if (artFetchCache[key]) applyFetchedArt(artFetchCache[key]);
    return;
  }
  try {
    const result = await window.electronAPI.fetchAlbumArt(title, artist);
    if (result && result.url) {
      artFetchCache[key] = result.url;
      // Only apply if still the same song
      if (lastMediaKey === key) applyFetchedArt(result.url);
    } else {
      artFetchCache[key] = null;
    }
  } catch {
    artFetchCache[key] = null;
  }
}

function applyFetchedArt(url) {
  const placeholder = document.getElementById('musicArtPlaceholder');
  dom.musicArt.src = url;
  dom.musicArt.style.display = 'block';
  placeholder.style.display = 'none';

  // Extract theme color from the fetched image
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c = document.createElement('canvas');
    const ctx2 = c.getContext('2d');
    c.width = 10; c.height = 10;
    ctx2.drawImage(img, 0, 0, 10, 10);
    try {
      const pixels = ctx2.getImageData(0, 0, 10, 10).data;
      extractThemeColorFromPixels(pixels);
    } catch {}
  };
  img.src = url;
}

// ── Audio Capture (System Audio → Bass Detection) ──

async function startAudioCapture() {
  if (audioCaptureActive) return;
  try {
    audioStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: { width: 1, height: 1 }
    });

    // Stop video track immediately - we only need audio
    audioStream.getVideoTracks().forEach(t => t.stop());

    const audioTrack = audioStream.getAudioTracks()[0];
    if (!audioTrack) return;

    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.15; // Low smoothing = sharper transients
    source.connect(analyser);
    bassFreqData = new Uint8Array(analyser.frequencyBinCount);
    audioCaptureActive = true;

    // Handle track ending (user revokes permission)
    audioTrack.addEventListener('ended', () => {
      audioCaptureActive = false;
      analyser = null;
    });
  } catch (e) {
    // Audio capture failed - music info still works, just no bass effects
    audioCaptureActive = false;
  }
}

function stopAudioCapture() {
  if (audioStream) {
    audioStream.getTracks().forEach(t => t.stop());
    audioStream = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
    analyser = null;
  }
  audioCaptureActive = false;
  bassFreqData = null;
}

// ── Bass Analysis (called every frame from animateStarfield) ──

function updateBassLevel() {
  if (!analyser || !musicEnabled || !bassFreqData) {
    bassLevel *= 0.9;
    bassSmooth *= 0.88;
    bassHit *= 0.85;
    peakBass *= 0.95;
    bassAvg *= 0.99;
    return;
  }

  analyser.getByteFrequencyData(bassFreqData);

  // Sub-bass (bins 0-1, ~0-375Hz) and bass (bins 2-4, ~375-940Hz)
  let subBass = 0;
  let bass = 0;
  for (let i = 0; i < 2; i++) subBass += bassFreqData[i];
  for (let i = 0; i < 5; i++) bass += bassFreqData[i];
  subBass /= (2 * 255);
  bass /= (5 * 255);

  const rawBass = Math.min(1, subBass * 0.65 + bass * 0.35);

  // Running average - tracks the "floor" level
  bassAvg = bassAvg * 0.97 + rawBass * 0.03;

  // Transient = how much above average (this is what you "feel")
  const transient = Math.max(0, rawBass - bassAvg * 0.85);

  // bassHit: sharp impulse that decays fast - each beat is distinct
  if (transient > bassHit) {
    bassHit = transient; // instant attack
  } else {
    bassHit *= 0.82; // fast decay - drops between beats
  }

  bassLevel = rawBass;

  // bassSmooth drives stars & glow - use transient, not absolute
  // This way constant bass = calm, beat hits = pulse
  bassSmooth = bassHit * 2.5;
  bassSmooth = Math.min(1, bassSmooth);

  // Peak detection for screen shake kicks
  if (transient > peakBass * 1.2 && transient > 0.08) {
    peakBass = transient;
    onBassKick(transient * 2);
  }
  peakBass *= 0.9;
}

// ── Screen Shake on Bass Kicks ──

function onBassKick(intensity) {
  // Scale shake with screen size for bigger impact on large displays
  const screenScale = Math.max(1, Math.min(2, canvas.height / 800));
  const force = Math.min(14 * screenScale, intensity * 22 * screenScale);
  shakeY = -force;
  shakeVelocity = force * 0.6;
}

function updateScreenShake() {
  if (Math.abs(shakeY) < 0.1 && Math.abs(shakeVelocity) < 0.1) {
    if (shakeY !== 0) {
      shakeY = 0;
      canvas.style.transform = '';
    }
    return;
  }

  // Spring physics: bounce back to 0
  const stiffness = 0.35;
  const damping = 0.65;
  shakeVelocity += (-shakeY * stiffness);
  shakeVelocity *= damping;
  shakeY += shakeVelocity;

  canvas.style.transform = `translateY(${shakeY.toFixed(1)}px)`;
}

// ── Theme Color Extraction from Album Art ──

function extractThemeColor(base64, mimeType) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    const ctx2 = c.getContext('2d');
    c.width = 10; c.height = 10;
    ctx2.drawImage(img, 0, 0, 10, 10);
    const pixels = ctx2.getImageData(0, 0, 10, 10).data;
    extractThemeColorFromPixels(pixels);
  };
  img.src = `data:${mimeType || 'image/jpeg'};base64,${base64}`;
}

function extractThemeColorFromPixels(pixels) {
  let bestColor = null;
  let bestScore = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max > 0 ? (max - min) / max : 0;
    const brightness = max / 255;
    const score = saturation * 2.5 + brightness * 0.4 - Math.abs(brightness - 0.6) * 0.5;
    if (brightness > 0.12 && brightness < 0.95 && score > bestScore) {
      bestScore = score;
      bestColor = { r, g, b };
    }
  }

  if (!bestColor || bestScore < 0.25) {
    themeColor = { r: 180, g: 200, b: 255 };
  } else {
    const { r, g, b } = bestColor;
    const maxC = Math.max(r, g, b, 1);
    const boost = Math.min(2.2, 220 / maxC);
    themeColor = {
      r: Math.min(255, Math.round(r * boost)),
      g: Math.min(255, Math.round(g * boost)),
      b: Math.min(255, Math.round(b * boost))
    };
  }
  applyThemeColor();
}

function applyThemeColor() {
  if (!musicEnabled || !themeColor || !currentMedia || currentMedia.status !== 'Playing') {
    dom.sessionPct.style.color = fontColor;
    dom.sessionPct.style.textShadow = '';
    return;
  }

  const { r, g, b } = themeColor;
  dom.sessionPct.style.color = `rgb(${r}, ${g}, ${b})`;
  dom.sessionPct.style.textShadow = `0 0 80px rgba(${r}, ${g}, ${b}, 0.15), 0 0 160px rgba(${r}, ${g}, ${b}, 0.06)`;

  // Also tint the music widget
  dom.musicWidget.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
  dom.musicWidget.style.boxShadow = `0 0 20px rgba(${r}, ${g}, ${b}, 0.06)`;
  dom.musicTitle.style.color = `rgb(${r}, ${g}, ${b})`;
}

// ═══════════════════════════════════════════════
// Start
// ═══════════════════════════════════════════════

init();
