// ═══════════════════════════════════════════════
// Deep Space Starfield
// ═══════════════════════════════════════════════

const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');

let stars = [];
const STAR_COUNT = 200;
const SPEED = 0.4;
let centerX, centerY;

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
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    s.prevX = (s.x / s.z) * 500 + centerX;
    s.prevY = (s.y / s.z) * 500 + centerY;
    s.z -= SPEED * 2;
    if (s.z <= 1) { stars[i] = createStar(false); continue; }
    const sx = (s.x / s.z) * 500 + centerX;
    const sy = (s.y / s.z) * 500 + centerY;
    if (sx < -100 || sx > canvas.width + 100 || sy < -100 || sy > canvas.height + 100) {
      stars[i] = createStar(false);
    }
  }
}

function drawStars() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const s of stars) {
    const sx = (s.x / s.z) * 500 + centerX;
    const sy = (s.y / s.z) * 500 + centerY;
    const depth = 1 - s.z / 1200;
    const size = Math.max(0.2, depth * 2.8);
    const alpha = Math.min(1, depth * 1.4) * s.brightness;

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
}

function animateStarfield() {
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
  weeklyToggleBtn: document.getElementById('weeklyToggleBtn'),
  moneyToggleBtn: document.getElementById('moneyToggleBtn'),
  resetMoneyBtn: document.getElementById('resetMoneyBtn'),
  colorBtn: document.getElementById('colorBtn'),
  cornerPulse: document.getElementById('cornerPulse'),
  menuToggleBtn: document.getElementById('menuToggleBtn'),
  controlsExpanded: document.getElementById('controlsExpanded'),
  refreshBtn: document.getElementById('refreshBtn'),
  fullscreenBtn: document.getElementById('fullscreenBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  statusLine: document.getElementById('statusLine')
};

let credentials = null;
let usageData = null;
let countdownInterval = null;
let autoRefreshInterval = null;
let isFetching = false;
let showWeekly = localStorage.getItem('showWeekly') === 'true';
let moneyMode = localStorage.getItem('moneyMode') === 'true';

// Money mode state - accumulates across sessions
let totalMoney = parseFloat(localStorage.getItem('totalMoney')) || 0;
let lastSessionPct = parseFloat(localStorage.getItem('lastSessionPct')) || 0;
let displayedMoney = totalMoney;
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
const COST_PER_SESSION = 1800;

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
    dom.weeklyToggleBtn.classList.add('active');
  }
  if (moneyMode) {
    dom.moneyToggleBtn.classList.add('active');
    applyMoneyMode();
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

  dom.fullscreenBtn.addEventListener('click', () => {
    window.electronAPI.toggleFullscreen();
  });

  dom.logoutBtn.addEventListener('click', async () => {
    await window.electronAPI.deleteCredentials();
    credentials = { sessionKey: null, organizationId: null };
    stopAutoRefresh();
    if (countdownInterval) clearInterval(countdownInterval);
    showScreen('login');
  });

  dom.weeklyToggleBtn.addEventListener('click', () => {
    showWeekly = !showWeekly;
    localStorage.setItem('showWeekly', showWeekly);
    dom.weeklySection.style.display = showWeekly ? 'block' : 'none';
    dom.weeklyToggleBtn.classList.toggle('active', showWeekly);
    if (showWeekly && usageData) updateWeeklyUI();
  });

  dom.moneyToggleBtn.addEventListener('click', () => {
    moneyMode = !moneyMode;
    localStorage.setItem('moneyMode', moneyMode);
    dom.moneyToggleBtn.classList.toggle('active', moneyMode);
    applyMoneyMode();
    if (moneyMode) {
      displayedMoney = totalMoney;
      renderMoneyDisplay();
    }
  });

  dom.resetMoneyBtn.addEventListener('click', showResetConfirm);
  dom.colorBtn.addEventListener('click', toggleColorPicker);

  dom.menuToggleBtn.addEventListener('click', () => {
    const expanded = dom.controlsExpanded.style.display !== 'none';
    dom.controlsExpanded.style.display = expanded ? 'none' : 'flex';
    dom.menuToggleBtn.classList.toggle('open', !expanded);
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
  dom.sessionPct.style.color = color;
}

function applyFontSize(size) {
  fontSize = size;
  localStorage.setItem('fontSize', size);
  dom.sessionPct.style.fontSize = `calc(${size / 100} * ${moneyMode ? 'clamp(64px, 12vw, 280px)' : 'clamp(72px, 14vw, 320px)'})`;
}

// Apply saved settings on startup
setTimeout(() => {
  dom.sessionPct.style.color = fontColor;
  if (fontSize !== 100) applyFontSize(fontSize);
}, 0);

function toggleColorPicker() {
  if (colorPopup) { colorPopup.remove(); colorPopup = null; return; }

  const presets = ['#ffffff', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c'];

  const popup = document.createElement('div');
  popup.className = 'color-popup';
  popup.innerHTML = `
    <div class="color-popup-title">Font Color</div>
    <div class="color-presets">
      ${presets.map(c => `<div class="color-swatch${c === fontColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
    </div>
    <div class="color-hex-row">
      <input type="text" class="color-hex-input" value="${fontColor}" placeholder="#ffffff" maxlength="7" />
      <button class="color-apply-btn">Apply</button>
    </div>
    <div class="color-popup-title" style="margin-top:16px;">Font Size</div>
    <div class="font-size-row">
      <input type="range" class="font-size-slider" min="50" max="200" step="5" value="${fontSize}" />
      <span class="font-size-val">${fontSize}%</span>
    </div>
  `;
  document.body.appendChild(popup);
  colorPopup = popup;

  // Preset clicks
  popup.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      applyFontColor(sw.dataset.color);
      popup.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      popup.querySelector('.color-hex-input').value = sw.dataset.color;
    });
  });

  // Hex input
  const input = popup.querySelector('.color-hex-input');
  const applyBtn = popup.querySelector('.color-apply-btn');
  applyBtn.addEventListener('click', () => {
    let hex = input.value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      applyFontColor(hex);
      popup.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === hex));
    }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyBtn.click(); });

  // Font size slider
  const slider = popup.querySelector('.font-size-slider');
  const sizeLabel = popup.querySelector('.font-size-val');
  slider.addEventListener('input', () => {
    const val = parseInt(slider.value);
    sizeLabel.textContent = `${val}%`;
    applyFontSize(val);
  });

  // Close on click outside
  const closeHandler = (e) => {
    if (!popup.contains(e.target) && e.target !== dom.colorBtn) {
      popup.remove();
      colorPopup = null;
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
    dom.resetMoneyBtn.style.display = '';
    dom.usageLabel.textContent = 'TOTAL SPENT';
    if (usageData) renderMoneyDisplay();
    startMoneyTick();
  } else {
    dom.sessionBarWrap.style.display = '';
    dom.resetMoneyBtn.style.display = 'none';
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
  dom.sessionPct.innerHTML = `$${wholeFormatted}<span class="money-cents">.${cents}</span>`;
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
  displayedMoney = totalMoney;

  renderMoneyDisplay();
  updateCornerPulse(newPct);
}

// Continuous tick - adds money at burn rate between refreshes
let lastTickTime = 0;

function moneyTick(now) {
  if (!moneyTickRunning) return;

  if (lastTickTime > 0 && burnRate > 0) {
    const dt = (now - lastTickTime) / 1000;
    // Cap dt to avoid huge jumps if tab was backgrounded
    if (dt < 2) {
      const increment = burnRate * dt;
      totalMoney += increment;
      displayedMoney = totalMoney;
      renderMoneyDisplay();
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

  try {
    usageData = await window.electronAPI.fetchUsageData();
    const newPct = usageData.five_hour?.utilization || 0;

    // Always track spending data regardless of mode
    onNewUsageData(newPct);

    if (!moneyMode) {
      updateSessionUI();
    }

    if (showWeekly) updateWeeklyUI();
    startCountdown();

    const now = new Date();
    dom.statusLine.textContent = `Updated ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setTimeout(() => { dom.statusLine.style.opacity = '0.3'; }, 2000);
  } catch (error) {
    if (error.message.includes('SessionExpired') || error.message.includes('Unauthorized')) {
      credentials = { sessionKey: null, organizationId: null };
      showScreen('login');
    } else {
      dom.statusLine.textContent = 'Failed to fetch';
    }
  } finally {
    isFetching = false;
  }
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
// Start
// ═══════════════════════════════════════════════

init();
