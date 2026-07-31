/* Claude Usage Deck — Stream Deck plugin
 * Fills the deck with usage from Claude Usage Space (local server on :37587).
 * Layout: one COLUMN per account → row0 name+plan, row1 5h session %, row2 weekly %.
 * Keys with no account run a starfield screensaver.
 */

const DATA_URL = 'http://127.0.0.1:37587/usage';
const SIZE = 144;

let ws = null;
let uuid = null;
const tiles = {};                 // context -> { column, row }
let data = { accounts: [] };
let reachable = false;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// ── Stream Deck entry point ──
function connectElgatoStreamDeckSocket(inPort, inUUID, inRegisterEvent, inInfo) {
  uuid = inUUID;
  ws = new WebSocket('ws://127.0.0.1:' + inPort);
  ws.onopen = () => { ws.send(JSON.stringify({ event: inRegisterEvent, uuid: inUUID })); log('registered'); poll(); };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onerror = () => log('ws error');
}
window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;

function log(m) {
  try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ event: 'logMessage', payload: { message: '[claudeusage] ' + m } })); } catch (e) {}
}

function onMessage(msg) {
  const { event, context, payload } = msg;
  if (event === 'willAppear') {
    const c = payload && payload.coordinates ? payload.coordinates : { column: 0, row: 0 };
    tiles[context] = { column: c.column, row: c.row, stars: makeStars(context) };
    log('willAppear col=' + c.column + ' row=' + c.row);
    renderTile(context);
  } else if (event === 'willDisappear') {
    delete tiles[context];
  } else if (event === 'deviceDidConnect' || event === 'didReceiveSettings') {
    renderAll();
  }
}

let _imgLogged = false;
function setImage(context, dataUrl) {
  if (!ws || ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify({ event: 'setImage', context, payload: { image: dataUrl, target: 0 } }));
    if (!_imgLogged) { _imgLogged = true; log('setImage sent len=' + dataUrl.length); }
  } catch (e) { log('setImage ERR ' + (e && e.message)); }
}

// ── Data polling ──
async function poll() {
  try {
    const r = await fetch(DATA_URL, { cache: 'no-store' });
    const j = await r.json();
    data = j && Array.isArray(j.accounts) ? j : { accounts: [] };
    reachable = true;
    log('poll ok accounts=' + data.accounts.length + ' tiles=' + Object.keys(tiles).length);
  } catch (e) {
    reachable = false;
    log('poll FAIL ' + (e && e.message));
  }
  renderAll();
}
setInterval(poll, 5000);
poll();

// data-tile refresh (timers tick) — gentle, only data tiles
setInterval(() => { for (const ctx0 in tiles) if (!isStarfield(tiles[ctx0])) renderTile(ctx0); }, 1000);

// starfield animation — slow enough that Stream Deck can keep up
setInterval(() => { for (const ctx0 in tiles) if (isStarfield(tiles[ctx0])) renderStarTile(ctx0); }, 700);

function renderAll() { for (const ctx0 in tiles) renderTile(ctx0); }

function accountFor(t) {
  const a = data.accounts[t.column];
  if (!a || a.error) return null;
  return a;
}
function isStarfield(t) { return !reachable || !accountFor(t); }

function renderTile(context) {
  const t = tiles[context];
  if (!t) return;
  try {
    if (isStarfield(t)) { renderStarTile(context); return; }
    const a = accountFor(t);
    if (t.row === 0) drawName(a);
    else if (t.row === 1) drawMetric(a.session, '5H SESSION', a.sessionResets);
    else drawMetric(a.week, '7 DAY', a.weekResets);
    setImage(context, canvas.toDataURL('image/png'));
  } catch (e) { log('renderTile ERR ' + (e && (e.message || e))); }
}

// ── Drawing helpers ──
function bg(a, b) {
  const g = ctx.createLinearGradient(0, 0, 0, SIZE);
  g.addColorStop(0, a || '#12151b');
  g.addColorStop(1, b || '#090b0f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

function severity(pct) {
  const stops = [
    [0, [52, 211, 153]], [55, [163, 230, 53]], [75, [251, 191, 36]],
    [90, [251, 146, 60]], [100, [248, 113, 113]]
  ];
  const v = Math.max(0, Math.min(100, pct));
  let A = stops[0], B = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (v >= stops[i][0] && v <= stops[i + 1][0]) { A = stops[i]; B = stops[i + 1]; break; }
  const tt = B[0] === A[0] ? 0 : (v - A[0]) / (B[0] - A[0]);
  return `rgb(${Math.round(A[1][0] + (B[1][0] - A[1][0]) * tt)},${Math.round(A[1][1] + (B[1][1] - A[1][1]) * tt)},${Math.round(A[1][2] + (B[1][2] - A[1][2]) * tt)})`;
}

function fitText(text, maxW, start, min) {
  let s = start;
  ctx.font = `700 ${s}px 'Segoe UI', sans-serif`;
  while (ctx.measureText(text).width > maxW && s > min) { s -= 2; ctx.font = `700 ${s}px 'Segoe UI', sans-serif`; }
  return s;
}

function drawName(a) {
  bg('#141821', '#0a0c11');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const name = (a.label || 'Account').toUpperCase();
  const size = fitText(name, SIZE - 16, 30, 13);
  ctx.font = `700 ${size}px 'Segoe UI', sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, SIZE / 2, a.plan ? SIZE / 2 - 14 : SIZE / 2);
  if (a.plan) {
    ctx.font = `600 16px 'Segoe UI', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(a.plan, SIZE / 2, SIZE / 2 + 22);
  }
}

function drawMetric(pct, label, resetsAt) {
  const col = severity(pct);
  bg('#12151b', '#080a0e');
  ctx.textAlign = 'center';

  // top label
  ctx.textBaseline = 'top';
  ctx.font = `600 15px 'Segoe UI', sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fillText(label, SIZE / 2, 12);

  // big percentage (severity colored, soft glow)
  ctx.textBaseline = 'middle';
  ctx.font = `800 58px 'Segoe UI', sans-serif`;
  ctx.shadowColor = col;
  ctx.shadowBlur = 22;
  ctx.fillStyle = col;
  ctx.fillText(pct + '%', SIZE / 2, SIZE / 2 + 4);
  ctx.shadowBlur = 0;

  // thin progress bar
  const bw = SIZE - 36, bx = 18, by = SIZE - 30;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(bx, by, bw, 5, 2.5); ctx.fill();
  ctx.fillStyle = col;
  roundRect(bx, by, bw * Math.min(pct, 100) / 100, 5, 2.5); ctx.fill();

  // reset countdown
  ctx.textBaseline = 'bottom';
  ctx.font = `500 14px 'Consolas', monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(countdown(resetsAt), SIZE / 2, SIZE - 6);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function countdown(iso) {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'resetting';
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm ' + s + 's';
}

// ── Starfield screensaver tile ──
function makeStars(seed) {
  let n = 0; for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) & 0xffff;
  const rnd = () => { n = (n * 1103515245 + 12345) & 0x7fffffff; return n / 0x7fffffff; };
  const stars = [];
  for (let i = 0; i < 26; i++) stars.push({ x: (rnd() - 0.5) * SIZE, y: (rnd() - 0.5) * SIZE, z: rnd() * SIZE + 20, b: 0.4 + rnd() * 0.6 });
  return stars;
}

function renderStarTile(context) {
  const t = tiles[context];
  if (!t) return;
  try {
  if (!ctx) { log('NO CTX canvas=' + (!!canvas)); return; }
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const cx = SIZE / 2, cy = SIZE / 2;
  for (const s of t.stars) {
    s.z -= 7;
    if (s.z < 8) { s.z = SIZE + 20; s.x = (Math.random() - 0.5) * SIZE; s.y = (Math.random() - 0.5) * SIZE; }
    const k = 90 / s.z;
    const px = cx + s.x * k, py = cy + s.y * k;
    if (px < 0 || px > SIZE || py < 0 || py > SIZE) continue;
    const depth = 1 - s.z / (SIZE + 20);
    const r = Math.max(0.5, depth * 2.4);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,214,255,${(depth * s.b).toFixed(2)})`;
    ctx.fill();
  }
  if (!reachable) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = `500 12px 'Segoe UI', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText('offline', SIZE / 2, SIZE - 6);
  }
  setImage(context, canvas.toDataURL('image/png'));
  } catch (e) { log('renderStarTile ERR ' + (e && (e.message || e))); }
}
