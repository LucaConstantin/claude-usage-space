// ═══════════════════════════════════════════════
// Deep Space Starfield
// ═══════════════════════════════════════════════

const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');

// Separate, never-shaken layer for the session-history graph
const overlayCanvas = document.getElementById('overlayCanvas');
const octx = overlayCanvas.getContext('2d');

// Offscreen buffer holding ONLY the star layer, with a partial fade so stars
// keep a motion-blur trail (longer on the beat). Glow effects are drawn on the
// main canvas instead, which is cleared each frame so they never smear.
const starBuffer = document.createElement('canvas');
const sctx = starBuffer.getContext('2d');

let stars = [];
const STAR_COUNT = 200;
const SPEED = 0.4;
let centerX, centerY;
let viewW = window.innerWidth;   // logical (CSS-pixel) canvas size
let viewH = window.innerHeight;

// Bass-reactive state (set by music system)
let bassSmooth = 0;
let bassLevel = 0;
let peakBass = 0;
let themeColor = null; // { r, g, b } from album art
// Expose themeColor globally so planet.js can read it
Object.defineProperty(window, 'themeColor', { get: () => themeColor });
let shakeY = 0;
let shakeVelocity = 0;
let bassAvg = 0;
let bassHit = 0;
let glowColor = localStorage.getItem('glowColor') || 'auto';
let bassGlowEnabled = localStorage.getItem('bassGlowEnabled') !== 'false';
// Declared early so the animation loop (which starts synchronously below) can
// read them without hitting the temporal dead zone.
let fontColor = localStorage.getItem('fontColor') || '#ffffff';
let musicEnabled = localStorage.getItem('musicEnabled') === 'true';
let insideShip = localStorage.getItem('insideShip') === 'true';  // metal interior background
let settingsOpen = false;  // hide the history graph while the settings scene is up
// Pointer parallax (used by the Inside Ship interior)
let pointerTX = 0, pointerTY = 0;   // target (-1..1 from screen center)
let pointerX = 0, pointerY = 0;     // smoothed
window.addEventListener('mousemove', (e) => {
  pointerTX = (e.clientX / window.innerWidth - 0.5) * 2;
  pointerTY = (e.clientY / window.innerHeight - 0.5) * 2;
});

// ── Session history: peak utilization (%) of past 5h sessions ──
let historyEnabled = localStorage.getItem('historyEnabled') !== 'false';
let sessionHistory = [];
try { sessionHistory = JSON.parse(localStorage.getItem('sessionHistory') || '[]'); } catch { sessionHistory = []; }
let sessionPeak = parseFloat(localStorage.getItem('sessionPeak')) || 0;

// ── Comet system ──
let comets = [];
const MAX_COMETS = 2;

// ── Shockwave system ──
let shockwaves = [];

// ── Session-reset celebration ──
let particles = [];      // burst particles
let celebFlash = 0;      // full-screen celebration flash 0..1

// ── Gravitational collapse state ──
let gravityPull = 0; // 0 = none, 1 = full black hole
let usagePct = 0; // current usage percentage for gravity effect

// ── Lightning storm state (builds 95% → 100%) ──
let bolts = [];          // active lightning bolts
let crackAlpha = 0;      // overall storm intensity, ramps with usage
let nextStrikeAt = 0;    // timestamp of next bolt spawn
let screenFlash = 0;     // full-screen flash 0..1

// Music state (must be before animateStarfield runs)
let currentMedia = null;
let mediaPollingInterval = null;
let audioStream = null;
let audioCtx = null;
let analyser = null;
let lastMediaKey = '';
let audioCaptureActive = false;
let bassFreqData = null;

// ── Intelligent Music Analysis State ──
const songAnalysis = {
  // Song timeline awareness
  songStartTime: 0,         // when current song started playing
  songDuration: 0,          // estimated duration (if available)
  introPhase: true,         // are we in the intro? (first ~15s)
  introFadeDuration: 8000,  // ms to ramp up from gentle to full

  // Energy profiling - learns the song's character
  energyHistory: [],        // rolling window of energy samples
  energyHistoryMax: 300,    // ~5 seconds at 60fps
  medianEnergy: 0,          // median energy of the song so far
  peakEnergy: 0,            // highest energy seen in this song
  energyFloor: 1,           // lowest sustained energy (silence floor)

  // BPM detection
  bpm: 0,
  bpmConfidence: 0,
  beatTimes: [],            // timestamps of detected beats
  lastBeatTime: 0,
  beatInterval: 0,          // ms between beats (from BPM)

  // Spectral flux for smarter onset detection
  prevSpectrum: null,       // previous frame's frequency data
  spectralFlux: 0,          // how much the spectrum changed this frame
  fluxHistory: [],          // rolling flux values for adaptive threshold
  fluxHistoryMax: 90,       // ~1.5 seconds

  // Beat prediction
  nextBeatTime: 0,          // predicted time of next beat
  beatPhase: 0,             // 0-1 where we are in the current beat cycle

  // Adaptive scaling
  effectIntensity: 0,       // 0-1, how intense effects should be right now
  smoothIntensity: 0,       // smoothed version for rendering
  volumeNormFactor: 1,      // multiplier to normalize quiet vs loud songs

  reset() {
    this.songStartTime = Date.now();
    this.introPhase = true;
    this.energyHistory = [];
    this.medianEnergy = 0;
    this.peakEnergy = 0;
    this.energyFloor = 1;
    this.bpm = 0;
    this.bpmConfidence = 0;
    this.beatTimes = [];
    this.lastBeatTime = 0;
    this.beatInterval = 0;
    this.prevSpectrum = null;
    this.spectralFlux = 0;
    this.fluxHistory = [];
    this.nextBeatTime = 0;
    this.beatPhase = 0;
    this.effectIntensity = 0;
    this.smoothIntensity = 0;
    this.volumeNormFactor = 1;
  }
};

function resizeCanvas() {
  // Render at native device resolution for crisp lines & text on hi-DPI screens,
  // while drawing in logical CSS pixels (context scaled by the device pixel ratio).
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Overlay matches the starfield resolution, also drawn in logical pixels
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
  overlayCanvas.style.width = viewW + 'px';
  overlayCanvas.style.height = viewH + 'px';
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  // Star trail buffer (same resolution, logical-pixel drawing)
  starBuffer.width = canvas.width;
  starBuffer.height = canvas.height;
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.fillStyle = '#000005';
  sctx.fillRect(0, 0, viewW, viewH);
  centerX = viewW / 2;
  centerY = viewH / 2;
}

function createStar(randomDepth) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * Math.max(viewW, viewH) * 0.9;
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
    if (sx < -100 || sx > viewW + 100 || sy < -100 || sy > viewH + 100) {
      stars[i] = createStar(false);
    }
  }
}

// Minimal dark-metal "ship interior" with pointer parallax (depth layers)
function drawInteriorBackground() {
  // smooth the pointer toward its target
  pointerX += (pointerTX - pointerX) * 0.06;
  pointerY += (pointerTY - pointerY) * 0.06;
  const px = pointerX, py = pointerY;

  // ── Far wall (base gradient) ──
  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, '#1b1d21');
  g.addColorStop(1, '#0d0e10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);

  // moving metal sheen (opposite the pointer, gives a reflective feel)
  const hx = viewW * 0.5 - px * 90;
  const hy = viewH * 0.42 - py * 90;
  const sheen = ctx.createRadialGradient(hx, hy, 0, hx, hy, Math.max(viewW, viewH) * 0.55);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
  sheen.addColorStop(0.6, 'rgba(255, 255, 255, 0.012)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, viewW, viewH);

  // ── Mid layer: panel seams (parallax ×18) ──
  const oxM = -px * 18, oyM = -py * 18;
  const seams = 4;
  ctx.lineWidth = 1;
  for (let i = 1; i < seams; i++) {
    const y = Math.round((viewH / seams) * i + oyM) + 0.5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(viewW, y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.beginPath(); ctx.moveTo(0, y + 1.5); ctx.lineTo(viewW, y + 1.5); ctx.stroke();
  }
  const vx = [viewW * 0.16 + oxM, viewW * 0.84 + oxM];
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
  for (const x of vx) {
    const rx = Math.round(x) + 0.5;
    ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, viewH); ctx.stroke();
  }

  // ── Near layer: rivets where seams cross (parallax ×30) ──
  const oxN = -px * 30, oyN = -py * 30;
  const rvx = [viewW * 0.16 + oxN, viewW * 0.84 + oxN];
  for (let i = 1; i < seams; i++) {
    const y = (viewH / seams) * i + oyN;
    for (const x of rvx) {
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x - 0.6, y - 0.6, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.09)'; ctx.fill();
    }
  }

  // subtle edge vignette for depth
  const vg = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.3, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75);
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, viewW, viewH);
}

function drawStars() {
  if (insideShip) {
    // Simple metal interior instead of the starfield; corner glow still applies
    drawInteriorBackground();
    drawCornerGlow();
    return;
  }

  // ── Star layer → offscreen buffer with a partial fade, so stars leave a
  // motion-blur trail that lengthens as they accelerate on the beat. ──
  const trailFade = 0.2 + bassSmooth * 0.12;
  sctx.fillStyle = `rgba(0, 0, 5, ${trailFade})`;
  sctx.fillRect(0, 0, viewW, viewH);

  const bassGlow = 1 + bassSmooth * 0.8;

  for (const s of stars) {
    const sx = (s.x / s.z) * 500 + centerX;
    const sy = (s.y / s.z) * 500 + centerY;
    const depth = 1 - s.z / 1200;
    const size = Math.max(0.2, depth * 2.8 * bassGlow);
    const alpha = Math.min(1, depth * 1.4 * bassGlow) * s.brightness;

    // Fade out stars near center so text is readable
    const dx = (sx - centerX) / viewW;
    const dy = (sy - centerY) / viewH;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
    const centerFade = Math.min(1, Math.max(0, (distFromCenter - 0.08) / 0.2));
    if (centerFade < 0.01) continue;

    const fadedAlpha = alpha * centerFade;

    if (depth > 0.55) {
      const streakAlpha = (depth - 0.55) * 1.8 * s.brightness * centerFade;
      sctx.beginPath();
      sctx.moveTo(s.prevX, s.prevY);
      sctx.lineTo(sx, sy);
      sctx.strokeStyle = s.hue
        ? `hsla(${s.hue}, 50%, 80%, ${streakAlpha * 0.3})`
        : `rgba(180, 190, 220, ${streakAlpha * 0.3})`;
      sctx.lineWidth = size * 0.5;
      sctx.stroke();
    }

    sctx.beginPath();
    sctx.arc(sx, sy, size, 0, Math.PI * 2);
    sctx.fillStyle = s.hue
      ? `hsla(${s.hue}, 50%, 85%, ${fadedAlpha})`
      : `rgba(210, 215, 235, ${fadedAlpha})`;
    sctx.fill();

    if (depth > 0.7 && size > 1.8) {
      sctx.beginPath();
      sctx.arc(sx, sy, size * 4, 0, Math.PI * 2);
      sctx.fillStyle = `rgba(200, 210, 240, ${fadedAlpha * 0.04})`;
      sctx.fill();
    }
  }

  // ── Composite the star buffer onto the main canvas, which is fully cleared
  // each frame so every glow effect drawn afterwards stays crisp (no smear). ──
  ctx.fillStyle = '#000005';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.drawImage(starBuffer, 0, 0, viewW, viewH);

  // Black radial gradient overlay in center for text readability
  const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(viewW, viewH) * 0.35);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
  grad.addColorStop(0.4, 'rgba(0, 0, 0, 0.7)');
  grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.2)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewW, viewH);

  drawCornerGlow();
}

// Bass corner glow — crisp, on the main layer so it never trails
function drawCornerGlow() {
  if (!bassGlowEnabled || bassSmooth <= 0.03) return;
  const bAlpha = bassSmooth * 0.18;
  const gc = getGlowRGB();
  const w = viewW, h = viewH;
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

// ── Comet System ──

function spawnComet() {
  if (comets.length >= MAX_COMETS) return;
  const gc = getGlowRGB();
  const side = Math.random();
  let x, y, vx, vy;
  const speed = 4 + Math.random() * 6;
  if (side < 0.25) { // from left
    x = -10; y = Math.random() * viewH;
    vx = speed; vy = (Math.random() - 0.5) * speed * 0.5;
  } else if (side < 0.5) { // from right
    x = viewW + 10; y = Math.random() * viewH;
    vx = -speed; vy = (Math.random() - 0.5) * speed * 0.5;
  } else if (side < 0.75) { // from top
    x = Math.random() * viewW; y = -10;
    vx = (Math.random() - 0.5) * speed * 0.5; vy = speed;
  } else { // from bottom
    x = Math.random() * viewW; y = viewH + 10;
    vx = (Math.random() - 0.5) * speed * 0.5; vy = -speed;
  }
  comets.push({
    x, y, vx, vy,
    trail: [],
    life: 1,
    r: gc.r, g: gc.g, b: gc.b,
    size: 2 + Math.random() * 2
  });
}

function updateAndDrawComets() {
  for (let i = comets.length - 1; i >= 0; i--) {
    const c = comets[i];
    c.trail.push({ x: c.x, y: c.y });
    if (c.trail.length > 35) c.trail.shift();
    c.x += c.vx;
    c.y += c.vy;
    c.life -= 0.008;

    // Draw trail
    for (let j = 0; j < c.trail.length; j++) {
      const t = j / c.trail.length;
      const alpha = t * c.life * 0.6;
      const sz = c.size * t;
      ctx.beginPath();
      ctx.arc(c.trail[j].x, c.trail[j].y, sz, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
      ctx.fill();
    }
    // Draw head
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.size * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${c.life * 0.9})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.size * 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${c.life * 0.15})`;
    ctx.fill();

    if (c.life <= 0 || c.x < -100 || c.x > viewW + 100 || c.y < -100 || c.y > viewH + 100) {
      comets.splice(i, 1);
    }
  }
}

// ── Shockwave System ──

function emitShockwave() {
  // Emit from music widget position (top-left)
  const widgetRect = dom.musicWidget.getBoundingClientRect();
  shockwaves.push({
    x: widgetRect.left + widgetRect.width / 2,
    y: widgetRect.top + widgetRect.height / 2,
    radius: 0,
    maxRadius: Math.max(viewW, viewH) * 1.2,
    speed: 8,
    life: 1
  });
}

function updateAndDrawShockwaves() {
  const gc = getGlowRGB();
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    sw.radius += sw.speed;
    sw.speed *= 1.02; // accelerate
    sw.life = 1 - (sw.radius / sw.maxRadius);

    if (sw.life <= 0) { shockwaves.splice(i, 1); continue; }

    const alpha = sw.life * 0.25;
    const width = 2 + sw.life * 3;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${gc.r}, ${gc.g}, ${gc.b}, ${alpha})`;
    ctx.lineWidth = width;
    ctx.stroke();

    // Inner glow ring
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// Push stars outward when shockwave passes them
function applyShockwaveToStars() {
  for (const sw of shockwaves) {
    if (sw.life <= 0) continue;
    for (const s of stars) {
      const sx = (s.x / s.z) * 500 + centerX;
      const sy = (s.y / s.z) * 500 + centerY;
      const dx = sx - sw.x;
      const dy = sy - sw.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Push stars in a ring around the shockwave front
      if (Math.abs(dist - sw.radius) < 40) {
        const push = sw.life * 15;
        s.z -= push; // push stars forward (closer to camera)
      }
    }
  }
}

// ── Session-Reset Celebration ──

function celebrateReset() {
  const accent = getAccentRGB();
  // green ("full tank") + white sparks + the current accent color
  const palette = [[110, 231, 168], [255, 255, 255], [accent.r, accent.g, accent.b]];
  for (let i = 0; i < 110; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 11;
    const c = palette[(Math.random() * palette.length) | 0];
    particles.push({
      x: centerX, y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.006 + Math.random() * 0.012,
      size: 1.5 + Math.random() * 3.5,
      r: c[0], g: c[1], b: c[2]
    });
  }
  // Centered shockwave + warm green flash
  shockwaves.push({ x: centerX, y: centerY, radius: 0, maxRadius: Math.max(viewW, viewH) * 1.2, speed: 11, life: 1 });
  celebFlash = 0.7;
  showResetBanner();
}

function showResetBanner() {
  const el = document.createElement('div');
  el.className = 'reset-banner';
  el.innerHTML = '<div class="reset-word">REFUELED</div><div class="reset-sub">fresh 5-hour session</div>';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function updateAndDrawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.97; p.vy *= 0.97;
    p.vy += 0.04;            // gentle gravity so they arc down
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const a = Math.max(0, p.life);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${a})`;
    ctx.shadowColor = `rgba(${p.r}, ${p.g}, ${p.b}, ${a})`;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawCelebrationFlash() {
  if (celebFlash <= 0.01) { celebFlash = 0; return; }
  ctx.save();
  ctx.fillStyle = `rgba(110, 231, 168, ${celebFlash * 0.12})`;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.restore();
  celebFlash *= 0.9;
}

// ── Gravitational Collapse ──

function updateGravity() {
  // Smooth transition to target gravity
  const targetGravity = usagePct >= 90 ? Math.min(1, (usagePct - 90) / 10) : 0;
  gravityPull += (targetGravity - gravityPull) * 0.02;
}

function applyGravityToStars() {
  if (gravityPull < 0.01) return;
  for (const s of stars) {
    const sx = (s.x / s.z) * 500;
    const sy = (s.y / s.z) * 500;
    const dist = Math.sqrt(sx * sx + sy * sy);
    if (dist > 10) {
      const pull = gravityPull * 0.15 * (500 / (dist + 100));
      s.x -= (sx / dist) * pull * s.z * 0.002;
      s.y -= (sy / dist) * pull * s.z * 0.002;
    }
  }
}

// ── Lightning Storm at 95%+ usage ──

// Build a jagged lightning path via recursive midpoint displacement
// (the way real lightning forks). Returns an array of {x1,y1,x2,y2} segments.
function makeBolt(x1, y1, x2, y2, displace, forkChance) {
  const segs = [];
  function divide(ax, ay, bx, by, disp, generation) {
    if (disp < 6) {
      segs.push({ x1: ax, y1: ay, x2: bx, y2: by });
      return;
    }
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    // displace the midpoint perpendicular to the segment
    const off = (Math.random() - 0.5) * disp;
    const mx = (ax + bx) / 2 + (-dy / len) * off;
    const my = (ay + by) / 2 + (dx / len) * off;
    divide(ax, ay, mx, my, disp / 2, generation);
    divide(mx, my, bx, by, disp / 2, generation);
    // occasionally fork off a branch that dies out quickly
    if (generation < 3 && Math.random() < forkChance) {
      const ang = Math.atan2(my - ay, mx - ax) + (Math.random() - 0.5) * 1.4;
      const flen = len * (0.4 + Math.random() * 0.5);
      divide(mx, my, mx + Math.cos(ang) * flen, my + Math.sin(ang) * flen, disp / 1.6, generation + 1);
    }
  }
  divide(x1, y1, x2, y2, displace, 0);
  return segs;
}

function spawnBolt() {
  // Strike from a random screen edge toward an off-center target so bolts
  // rake across the whole screen, not just the middle.
  const w = viewW, h = viewH;
  const edge = Math.floor(Math.random() * 4);
  let sx, sy;
  if (edge === 0) { sx = Math.random() * w; sy = -20; }
  else if (edge === 1) { sx = Math.random() * w; sy = h + 20; }
  else if (edge === 2) { sx = -20; sy = Math.random() * h; }
  else { sx = w + 20; sy = Math.random() * h; }
  const tx = w * (0.3 + Math.random() * 0.4);
  const ty = h * (0.3 + Math.random() * 0.4);
  const reach = Math.hypot(tx - sx, ty - sy);

  bolts.push({
    segs: makeBolt(sx, sy, tx, ty, reach * 0.35, 0.45),
    life: 1,
    decay: 0.06 + Math.random() * 0.08,     // ~150-280ms lifetime
    flickerSeed: Math.random() * 1000,
    width: 1.4 + Math.random() * 1.6
  });

  // Bright strikes briefly light the whole scene
  screenFlash = Math.min(1, screenFlash + 0.35 + Math.random() * 0.25);
}

function strokeBolt(b) {
  ctx.beginPath();
  for (const s of b.segs) {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.stroke();
}

function drawLightning() {
  const targetAlpha = usagePct >= 95 ? Math.min(1, (usagePct - 95) / 5) : 0;
  crackAlpha += (targetAlpha - crackAlpha) * 0.04;

  if (crackAlpha < 0.01 && bolts.length === 0 && screenFlash < 0.01) {
    bolts.length = 0;
    return;
  }

  const now = Date.now();

  // One occasional strike at a time — never a swarm, since you can sit at
  // 100% for a long time and a constant storm looks bad.
  if (crackAlpha > 0.4 && bolts.length === 0 && now >= nextStrikeAt) {
    spawnBolt();
    nextStrikeAt = now + 2200 + Math.random() * 3800;    // a bolt every ~2-6s
  }

  // Warm full-screen flash from recent strikes
  if (screenFlash > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(255, 90, 60, ${screenFlash * 0.10 * crackAlpha})`;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
    screenFlash *= 0.82;
  }

  // Draw and age each bolt
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    // erratic flicker so the bolt stutters like real lightning
    const flick = 0.55 + Math.abs(Math.sin(now * 0.05 + b.flickerSeed)) * 0.45;
    const a = b.life * flick * crackAlpha;

    // Wide red outer glow (bloom via shadow)
    ctx.shadowColor = `rgba(255, 60, 40, ${a})`;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = `rgba(255, 50, 30, ${a * 0.35})`;
    ctx.lineWidth = b.width * 6;
    strokeBolt(b);

    // Orange mid glow
    ctx.shadowBlur = 12;
    ctx.strokeStyle = `rgba(255, 150, 60, ${a * 0.6})`;
    ctx.lineWidth = b.width * 2.4;
    strokeBolt(b);

    // White-hot core
    ctx.shadowColor = `rgba(255, 220, 180, ${a})`;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = `rgba(255, 245, 235, ${Math.min(1, a * 1.3)})`;
    ctx.lineWidth = b.width;
    strokeBolt(b);

    b.life -= b.decay;
    if (b.life <= 0) bolts.splice(i, 1);
  }
  ctx.restore();
}

// ── Session History Graph (elegant, centered, themed) ──

function drawHistoryGraph() {
  // Drawn on the overlay layer, which is never shaken by the beat — so it
  // stays perfectly fixed. Clear it every frame (even when hidden).
  octx.clearRect(0, 0, viewW, viewH);

  if (!historyEnabled || settingsOpen) return;
  const data = sessionHistory.slice(-14);   // last N sessions, kept readable
  const n = data.length;
  if (n === 0) return;

  const w = viewW;
  const h = viewH;
  const gc = getAccentRGB();
  const col = (a) => `rgba(${gc.r}, ${gc.g}, ${gc.b}, ${a})`;

  // Centered, not full width
  const chartW = Math.min(w * 0.6, 760);
  const left = (w - chartW) / 2;
  const baseY = h - 54;                      // baseline, with room for caption
  const maxH = Math.min(h * 0.15, 120);
  const slot = chartW / n;
  const barW = Math.min(slot * 0.34, 13);

  octx.save();
  octx.textAlign = 'center';
  octx.textBaseline = 'alphabetic';

  // Whisper-faint baseline that fades out at both ends
  const baseGrad = octx.createLinearGradient(left, 0, left + chartW, 0);
  baseGrad.addColorStop(0, col(0));
  baseGrad.addColorStop(0.5, col(0.10));
  baseGrad.addColorStop(1, col(0));
  octx.strokeStyle = baseGrad;
  octx.lineWidth = 1;
  octx.beginPath();
  octx.moveTo(left, baseY + 0.5);
  octx.lineTo(left + chartW, baseY + 0.5);
  octx.stroke();

  for (let i = 0; i < n; i++) {
    const v = Math.min(100, Math.max(0, data[i].peak));
    const cx = left + slot * (i + 0.5);
    const barH = Math.max((v / 100) * maxH, 2);
    const y = baseY - barH;
    const isLast = i === n - 1;

    // Bar: soft column that dissolves completely into the background at its base
    const g = octx.createLinearGradient(0, y, 0, baseY);
    g.addColorStop(0, col(isLast ? 0.55 : 0.26));
    g.addColorStop(0.55, col(isLast ? 0.18 : 0.09));
    g.addColorStop(1, col(0));
    octx.fillStyle = g;
    const r = Math.min(barW / 2, 4);
    octx.beginPath();
    octx.roundRect(cx - barW / 2, y, barW, barH, [r, r, 0, 0]);
    octx.fill();

    // Soft glowing cap on top of the bar
    octx.fillStyle = col(isLast ? 0.95 : 0.55);
    octx.shadowColor = col(0.7);
    octx.shadowBlur = isLast ? 14 : 6;
    octx.beginPath();
    octx.roundRect(cx - barW / 2, y, barW, 1.6, 0.8);
    octx.fill();
    octx.shadowBlur = 0;

    // Value label above the bar (latest one brighter)
    octx.fillStyle = col(isLast ? 0.85 : 0.38);
    octx.font = `${isLast ? 600 : 400} 10px "JetBrains Mono", monospace`;
    octx.fillText(`${v}%`, cx, y - 7);
  }

  // Captions under the baseline
  octx.shadowBlur = 0;
  octx.font = '500 8px "Space Grotesk", sans-serif';
  octx.letterSpacing = '2.5px';
  octx.fillStyle = col(0.22);
  octx.textAlign = 'left';
  octx.fillText('SESSION HISTORY', left, baseY + 18);
  octx.textAlign = 'right';
  octx.fillText(`PEAK · LAST ${n}`, left + chartW, baseY + 18);
  octx.letterSpacing = '0px';

  octx.restore();
}

// ── Film grain / dither overlay ──
// A faint static noise layer that breaks up gradient banding on large hi-res
// screens, giving the smooth, shader-like look of dithered rendering.
let grainPattern = null;
function buildGrain() {
  const size = 140;
  const nc = document.createElement('canvas');
  nc.width = size; nc.height = size;
  const nctx = nc.getContext('2d');
  const img = nctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
  grainPattern = ctx.createPattern(nc, 'repeat');
}

function drawGrain() {
  if (!grainPattern) buildGrain();
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = grainPattern;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.restore();
}

function animateStarfield() {
  updateBassLevel();
  updateScreenShake();
  updateGravity();
  applyGravityToStars();
  applyShockwaveToStars();
  updateStars();
  drawStars();
  drawHistoryGraph();
  updateAndDrawComets();
  updateAndDrawShockwaves();
  updateAndDrawParticles();
  drawLightning();
  drawCelebrationFlash();
  drawGrain();
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
let multiAccount = localStorage.getItem('multiAccount') === 'true';
let accounts = [];        // [{ id, label, organizationId }]
let multiUsage = [];      // last fetched per-account usage for the split view
let acctTrack = {};       // id -> { last, peak } for detecting per-account session resets
// musicEnabled is declared near the top (read early by the render loop)

// Money mode state - accumulates across sessions
let totalMoney = parseFloat(localStorage.getItem('totalMoney')) || 0;
let lastSessionPct = parseFloat(localStorage.getItem('lastSessionPct')) || 0;
let displayedMoney = totalMoney;
let targetMoney = totalMoney;
let burnRate = 0;
let lastPct = 0;
let lastPctTime = 0;
let moneyTickRunning = false;

// Per-session estimates are expressed PER PRO TIER and scaled by the detected
// plan factor (Max 5x → ×5, Max 20x → ×20). The claude.ai API only exposes
// utilization %, not absolute token/$ budgets — so these stay estimates, but
// plan-accurate ones once the subscription tier is detected.
let plan = null;                          // { key, label, factor, tier } from the API
const PRO_COST_PER_SESSION = 90;          // ~$ of real API compute for a full Pro session
let COST_PER_SESSION = parseFloat(localStorage.getItem('costPerSession')) || PRO_COST_PER_SESSION;

// Apply a detected plan: auto-scale the cost budget to the tier unless the user
// set their own value in settings.
function applyPlan(p) {
  if (!p || !p.factor) return;
  plan = p;
  if (!localStorage.getItem('costPerSession')) {
    COST_PER_SESSION = Math.round(PRO_COST_PER_SESSION * p.factor);
  }
}

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
  // Planet scene inits itself via module - no need to call here
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

  accounts = await window.electronAPI.listAccounts();

  if ((credentials.sessionKey && credentials.organizationId) || accounts.length) {
    showScreen('main');
    applyMultiAccount(multiAccount);
    await refreshUsage();
    startAutoRefresh();
  } else {
    showScreen('login');
  }
}

// Dispatch to the right fetch depending on the active view
async function refreshUsage() {
  if (multiAccount && accounts.length) return fetchAllUsageData();
  return fetchUsageData();
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
    await refreshUsage();
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

// fontColor is declared near the top (needed early by the render loop)
let fontSize = parseInt(localStorage.getItem('fontSize')) || 100; // percentage scale (50-200)
let colorPopup = null;

function applyFontColor(color) {
  fontColor = color;
  localStorage.setItem('fontColor', color);
  // Cards follow the chosen color too
  document.documentElement.style.setProperty('--card-accent', color);
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

// Accent color = whatever color the big percentage is currently shown in
// (album-art theme while music plays, otherwise the chosen font color).
function getAccentRGB() {
  if (musicEnabled && themeColor && currentMedia && currentMedia.status === 'Playing') {
    return themeColor;
  }
  const hex = /^#[0-9a-fA-F]{6}$/.test(fontColor) ? fontColor : '#ffffff';
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

function applyFontSize(size) {
  fontSize = size;
  localStorage.setItem('fontSize', size);
  const clamp = moneyMode ? 'clamp(64px, 12vw, 280px)'
              : 'clamp(72px, 14vw, 320px)';
  dom.sessionPct.style.fontSize = `calc(${size / 100} * ${clamp})`;
  document.documentElement.style.setProperty('--font-scale', size / 100);
}

// Apply saved settings on startup
setTimeout(() => {
  dom.sessionPct.style.color = fontColor;
  document.documentElement.style.setProperty('--card-accent', fontColor);
  document.documentElement.style.setProperty('--font-scale', fontSize / 100);
  if (fontSize !== 100) applyFontSize(fontSize);
}, 0);

// ═══════════════════════════════════════════════
// Unified Settings Popup
// ═══════════════════════════════════════════════

let settingsPopup = null;

function openSettingsScene() {
  settingsOpen = true;
  if (window.PlanetScene) PlanetScene.show();   // planet ONLY appears in settings
  const mv = document.getElementById('multiView');
  if (mv) mv.style.display = 'none';            // hide cards → only the planet
}

function closeSettingsScene() {
  settingsOpen = false;
  if (window.PlanetScene) PlanetScene.hide();
  const mv = document.getElementById('multiView');
  if (mv && multiAccount && accounts.length) mv.style.display = 'flex';   // bring cards back
}

function toggleSettings() {
  if (settingsPopup) {
    settingsPopup.remove(); settingsPopup = null;
    closeSettingsScene();
    return;
  }

  // Settings scene: only the planet visible; hide the cards/main content
  openSettingsScene();

  const presets = ['#ffffff', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c'];
  const glowPresets = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c'];

  const popup = document.createElement('div');
  popup.className = 'settings-popup';

  let html = `
    <div class="settings-section">
      <div class="settings-title">Features${plan ? ` <span style="font-weight:400;color:rgba(255,255,255,0.3);font-size:11px;letter-spacing:0;">· ${plan.label}</span>` : ''}</div>
      <div class="settings-row"><span class="settings-label">Music Visualization</span><div class="toggle-switch${musicEnabled ? ' active' : ''}" data-toggle="music"></div></div>
      <div class="settings-row"><span class="settings-label">Bass Corner Glow</span><div class="toggle-switch${bassGlowEnabled ? ' active' : ''}" data-toggle="bassGlow"></div></div>
      <div class="settings-row"><span class="settings-label">Money Mode</span><div class="toggle-switch${moneyMode ? ' active' : ''}" data-toggle="money"></div></div>
      <div class="settings-row"><span class="settings-label">Usage History</span><div class="toggle-switch${historyEnabled ? ' active' : ''}" data-toggle="history"></div></div>
    </div>

    <div class="settings-section">
      <div class="settings-title">Accounts</div>
      <div class="settings-row"><span class="settings-label">Multi-Account (split)</span><div class="toggle-switch${multiAccount ? ' active' : ''}" data-toggle="multi"></div></div>
      <div class="acct-manage">
        ${accounts.length ? accounts.map(a => {
          const info = accInfo(a.id);
          const sc = info ? severityRGB(info.session) : null;
          const dot = sc ? `rgb(${sc.r},${sc.g},${sc.b})` : 'rgba(255,255,255,0.2)';
          return `<div class="acct-manage-row" data-id="${a.id}">
            <div class="acct-row-top">
              <span class="acct-dot" data-dot="${a.id}" style="background:${dot};color:${dot}"></span>
              <input class="acct-name-input" data-id="${a.id}" value="${escapeHtml(a.label)}" spellcheck="false" maxlength="40" />
              <button class="acct-remove" data-remove="${a.id}" title="Remove">&times;</button>
            </div>
            <div class="acct-row-detail" data-detail="${a.id}">${accDetailText(a.id)}</div>
          </div>`;
        }).join('') : '<div class="settings-hint" style="font-size:11px;color:rgba(255,255,255,0.35);">No accounts yet.</div>'}
      </div>
      <button class="add-account-btn" id="addAccountBtn">+ Add account</button>
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
    <div class="settings-section">
      <div class="settings-title">Environment</div>
      <div class="settings-row"><span class="settings-label">Inside Ship</span><div class="toggle-switch${insideShip ? ' active' : ''}" data-toggle="insideShip"></div></div>
      <div class="settings-hint" style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px;">Swap the starfield for a plain dark-metal interior.</div>
    </div>

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
      } else if (key === 'history') {
        historyEnabled = on;
        localStorage.setItem('historyEnabled', on);
      } else if (key === 'money') {
        moneyMode = on;
        localStorage.setItem('moneyMode', on);
        applyMoneyMode();
        if (on) { targetMoney = totalMoney; displayedMoney = totalMoney; renderMoneyDisplay(); }
        // Rebuild popup to show/hide money config
        settingsPopup.remove(); settingsPopup = null; toggleSettings();
      } else if (key === 'multi') {
        multiAccount = on;
        localStorage.setItem('multiAccount', on);
        applyMultiAccount(on);
        refreshUsage();
      } else if (key === 'insideShip') {
        insideShip = on;
        localStorage.setItem('insideShip', on);
        updatePlanetAmbient();
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

  // ── Accounts management ──
  const addBtn = popup.querySelector('#addAccountBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      addBtn.textContent = 'Opening login…';
      try {
        const res = await window.electronAPI.addAccount();
        if (res && res.success) {
          accounts = await window.electronAPI.listAccounts();
          settingsPopup.remove(); settingsPopup = null; toggleSettings();  // rebuild list, keep planet
          refreshUsage();
          return;
        }
        addBtn.textContent = (res && res.error) || 'Failed';
      } catch (e) {
        addBtn.textContent = 'Failed';
      }
      addBtn.disabled = false;
      setTimeout(() => { if (addBtn.isConnected) addBtn.textContent = '+ Add account'; }, 2500);
    });
  }
  popup.querySelectorAll('.acct-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.remove;
      const res = await window.electronAPI.removeAccount(id);
      accounts = (res && res.accounts) || await window.electronAPI.listAccounts();
      settingsPopup.remove(); settingsPopup = null;
      if (!accounts.length) {
        credentials = { sessionKey: null, organizationId: null };
        stopAutoRefresh();
        showScreen('login');
        return;
      }
      toggleSettings();
      refreshUsage();
    });
  });
  popup.querySelectorAll('.acct-name-input').forEach(input => {
    const commit = async () => {
      const id = input.dataset.id;
      const label = input.value.trim();
      if (!label) return;
      const acc = accounts.find(a => a.id === id);
      if (acc && acc.label === label) return;
      if (acc) acc.label = label;
      await window.electronAPI.renameAccount(id, label);
      if (multiAccount) renderMultiView(multiUsage);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  });

  // Fetch fresh per-account details so each row shows plan + session/week %
  if (accounts.length) {
    (async () => {
      try {
        const list = await window.electronAPI.fetchAllUsage();
        multiUsage = list;
        if (!settingsPopup) return;
        list.forEach(a => {
          const detailEl = settingsPopup.querySelector(`.acct-row-detail[data-detail="${a.id}"]`);
          const dotEl = settingsPopup.querySelector(`.acct-dot[data-dot="${a.id}"]`);
          if (detailEl) detailEl.textContent = accDetailText(a.id, a.error);
          const info = accInfo(a.id);
          if (dotEl && info) {
            const s = severityRGB(info.session);
            dotEl.style.background = `rgb(${s.r},${s.g},${s.b})`;
            dotEl.style.color = `rgb(${s.r},${s.g},${s.b})`;
          }
        });
      } catch (e) {}
    })();
  }

  // ── Actions ──
  popup.querySelector('#settingsFullscreen').addEventListener('click', () => window.electronAPI.toggleFullscreen());
  popup.querySelector('#settingsLogout').addEventListener('click', async () => {
    await window.electronAPI.deleteCredentials();
    credentials = { sessionKey: null, organizationId: null };
    accounts = [];
    stopAutoRefresh();
    if (countdownInterval) clearInterval(countdownInterval);
    showScreen('login');
    settingsPopup.remove(); settingsPopup = null;
  });

  // Close on click outside
  const closeHandler = (e) => {
    if (!popup.contains(e.target) && e.target !== dom.settingsBtn) {
      popup.remove(); settingsPopup = null;
      closeSettingsScene();
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

// Record the peak utilization of a session that just reset, into history
function recordSessionEnd() {
  if (sessionPeak >= 1) {
    sessionHistory.push({ peak: Math.round(sessionPeak), t: Date.now() });
    if (sessionHistory.length > 60) sessionHistory = sessionHistory.slice(-60);
    localStorage.setItem('sessionHistory', JSON.stringify(sessionHistory));
  }
  sessionPeak = 0;
  localStorage.setItem('sessionPeak', '0');
}

// Per-account session tracking for the combined history graph (multi-account).
// All accounts' past sessions land in the SAME sessionHistory timeline.
function recordMultiSession(id, pct) {
  let t = acctTrack[id];
  if (!t) { acctTrack[id] = { last: pct, peak: pct }; return; } // first sighting — no false reset
  if (pct < t.last - 10) {
    if (t.peak >= 1) {
      sessionHistory.push({ peak: Math.round(t.peak), t: Date.now(), acc: id });
      if (sessionHistory.length > 60) sessionHistory = sessionHistory.slice(-60);
      localStorage.setItem('sessionHistory', JSON.stringify(sessionHistory));
    }
    t.peak = pct;
  }
  t.peak = Math.max(t.peak, pct);
  t.last = pct;
}

// Called when new usage data arrives - accumulates cost and recalculates burn rate
function onNewUsageData(newPct) {
  const now = Date.now();

  // Detect session reset (utilization dropped significantly)
  if (newPct < lastSessionPct - 10) {
    // Session reset happened - record the session that just ended (for history),
    // its cost is already accumulated; start tracking the new session from current pct
    recordSessionEnd();
    lastSessionPct = 0;
    // Celebrate the refuel — but not on the very first fetch of this run, which
    // could just be stale saved state rather than a reset we actually witnessed.
    if (!firstUsageFetch) celebrateReset();
  }

  // Track the peak utilization of the current session for the history graph
  if (newPct > sessionPeak) {
    sessionPeak = newPct;
    localStorage.setItem('sessionPeak', sessionPeak.toFixed(2));
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
  firstUsageFetch = false;
}
let firstUsageFetch = true;

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
      accounts = await window.electronAPI.listAccounts();
      showScreen('main');
      applyMultiAccount(multiAccount);
      await refreshUsage();
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
      accounts = await window.electronAPI.listAccounts();
      dom.sessionKeyInput.value = '';
      showScreen('main');
      applyMultiAccount(multiAccount);
      await refreshUsage();
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

      // Scale token/cost budgets to the detected subscription plan
      if (usageData.plan) applyPlan(usageData.plan);

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
    await refreshUsage();
    dom.refreshBtn.classList.remove('spinning');
  }, REFRESH_MS);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; }
}

// ═══════════════════════════════════════════════
// Multi-Account Split View
// ═══════════════════════════════════════════════

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Per-account snapshot (plan + session/week %) from the last multi fetch
function accInfo(id) {
  const a = multiUsage.find(x => x.id === id);
  if (!a || !a.ok || !a.data) return null;
  const d = a.data;
  return {
    plan: d.plan?.label || '',
    session: Math.round(d.five_hour?.utilization || 0),
    week: Math.round(d.seven_day?.utilization || 0)
  };
}

function accDetailText(id, err) {
  const info = accInfo(id);
  if (info) return `${info.plan ? info.plan + ' · ' : ''}session ${info.session}% · week ${info.week}%`;
  return err === 'SessionExpired' ? 'session expired — reconnect' : 'loading…';
}

// Smooth severity color: calm green → lime → amber → orange → red as usage climbs
function severityRGB(pct) {
  const stops = [
    { p: 0,   c: [52, 211, 153] },   // emerald
    { p: 55,  c: [163, 230, 53] },   // lime
    { p: 75,  c: [251, 191, 36] },   // amber
    { p: 90,  c: [251, 146, 60] },   // orange
    { p: 100, c: [248, 113, 113] }   // red
  ];
  const v = Math.max(0, Math.min(100, pct));
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i].p && v <= stops[i + 1].p) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const t = b.p === a.p ? 0 : (v - a.p) / (b.p - a.p);
  return {
    r: Math.round(a.c[0] + (b.c[0] - a.c[0]) * t),
    g: Math.round(a.c[1] + (b.c[1] - a.c[1]) * t),
    b: Math.round(a.c[2] + (b.c[2] - a.c[2]) * t)
  };
}

function applyMultiAccount(on) {
  multiAccount = on;
  const mv = document.getElementById('multiView');
  const uc = document.querySelector('.usage-center');
  if (on && accounts.length) {
    if (uc) uc.style.display = 'none';
    if (mv) mv.style.display = 'flex';
  } else {
    if (mv) mv.style.display = 'none';
    if (uc) uc.style.display = '';
  }
  updatePlanetAmbient();
}

// Planet appears ONLY in the settings scene now — keep ambient mode off
function updatePlanetAmbient() {
  if (window.PlanetScene && PlanetScene.setAmbient) PlanetScene.setAmbient(false);
}

async function fetchAllUsageData() {
  if (isFetching) return;
  isFetching = true;
  dom.statusLine.textContent = 'Fetching...';
  dom.statusLine.style.opacity = '1';
  try {
    multiUsage = await window.electronAPI.fetchAllUsage();
    // Record each account's session peaks into the shared history timeline
    for (const a of multiUsage) {
      if (a.ok && a.data) recordMultiSession(a.id, Math.round(a.data.five_hour?.utilization || 0));
    }
    renderMultiView(multiUsage);
    startCountdown();
    autoEnrichNames();
    const now = new Date();
    dom.statusLine.textContent = `Updated ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setTimeout(() => { dom.statusLine.style.opacity = '0.3'; }, 2000);
  } catch (e) {
    dom.statusLine.textContent = 'Failed to fetch';
  }
  isFetching = false;
}

// Replace default "Account N" labels with the real name from the Claude account
async function autoEnrichNames() {
  const defaults = accounts.filter(a => /^Account \d+$/.test(a.label));
  if (!defaults.length) return;
  let changed = false;
  for (const a of defaults) {
    try {
      const res = await window.electronAPI.enrichAccountName(a.id);
      if (res && res.success && res.label) { a.label = res.label; changed = true; }
    } catch (e) {}
  }
  if (changed) renderMultiView(multiUsage);
}

// Build a card once; values are patched in place on refresh (no flicker)
function cardSkeleton(a) {
  return `<div class="acct-card" data-id="${a.id}">
      <div class="acct-label"><span class="acct-name">${escapeHtml(a.label)}</span><span class="acct-plan"></span></div>
      <div class="acct-pct">&mdash;</div>
      <div class="acct-bar"><div class="acct-bar-fill"></div></div>
      <div class="acct-meta">
        <div class="acct-meta-row"><span>Session resets</span><b class="acct-cd acct-scd" data-resets="">&mdash;</b></div>
        <div class="acct-meta-row"><span>Week</span><b class="acct-wk">&mdash;</b></div>
        <div class="acct-meta-row"><span>Week resets</span><b class="acct-cd acct-wcd" data-resets="">&mdash;</b></div>
      </div>
    </div>`;
}

function updateCard(mv, a) {
  const card = mv.querySelector(`.acct-card[data-id="${a.id}"]`);
  if (!card) return;
  const nameEl = card.querySelector('.acct-name');
  if (nameEl) nameEl.textContent = a.label;

  if (!a.ok || !a.data) {
    card.classList.add('error');
    const pctEl = card.querySelector('.acct-pct');
    pctEl.className = 'acct-pct';
    pctEl.textContent = a.error === 'SessionExpired' ? 'Session expired' : 'Unavailable';
    card.querySelector('.acct-plan').textContent = '';
    card.querySelector('.acct-scd').textContent = '—';
    card.querySelector('.acct-wk').textContent = '—';
    card.querySelector('.acct-wcd').textContent = '—';
    return;
  }
  card.classList.remove('error');
  const d = a.data;
  const pct = Math.round(d.five_hour?.utilization || 0);
  const wk = Math.round(d.seven_day?.utilization || 0);
  const sReset = d.five_hour?.resets_at || '';
  const wReset = d.seven_day?.resets_at || '';

  card.querySelector('.acct-plan').textContent = d.plan?.label ? ` · ${d.plan.label}` : '';

  // Intelligent severity color for the session percentage + bar
  const sc = severityRGB(pct);
  const pctEl = card.querySelector('.acct-pct');
  pctEl.textContent = `${pct}%`;
  pctEl.className = 'acct-pct';
  pctEl.style.color = `rgb(${sc.r}, ${sc.g}, ${sc.b})`;
  const bar = card.querySelector('.acct-bar-fill');
  bar.style.width = Math.min(pct, 100) + '%';
  bar.className = 'acct-bar-fill';
  bar.style.background = `rgba(${sc.r}, ${sc.g}, ${sc.b}, 0.8)`;
  bar.style.boxShadow = `0 0 16px rgba(${sc.r}, ${sc.g}, ${sc.b}, 0.25)`;

  const scd = card.querySelector('.acct-scd'); scd.dataset.resets = sReset; scd.textContent = formatCountdown(sReset);
  const wkEl = card.querySelector('.acct-wk');
  const wc = severityRGB(wk);
  wkEl.textContent = `${wk}%`;
  wkEl.style.color = `rgb(${wc.r}, ${wc.g}, ${wc.b})`;
  const wcd = card.querySelector('.acct-wcd'); wcd.dataset.resets = wReset; wcd.textContent = formatCountdown(wReset);
}

function renderMultiView(list) {
  const mv = document.getElementById('multiView');
  if (!mv) return;
  if (!list || !list.length) {
    mv.dataset.ids = '';
    mv.innerHTML = '<div class="acct-card error"><div class="acct-label"><span class="acct-name">No accounts</span></div><div class="acct-meta"><div class="acct-meta-row"><span>Add one in settings</span></div></div></div>';
    return;
  }
  const ids = list.map(a => a.id).join(',');
  if (mv.dataset.ids !== ids) {
    mv.dataset.ids = ids;
    mv.innerHTML = list.map(cardSkeleton).join('');
  }
  list.forEach(a => updateCard(mv, a));
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
  usagePct = pct;
  // Hide old corner pulse - replaced by cracks system
  dom.cornerPulse.style.display = 'none';
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
  // Multi-account cards keep their own live countdowns
  if (multiAccount) {
    document.querySelectorAll('.acct-cd').forEach(el => {
      if (el.dataset.resets) el.textContent = formatCountdown(el.dataset.resets);
    });
  }

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

    // Reset song analysis on song change - fresh analysis for new track
    if (songChanged) {
      songAnalysis.reset();
      emitShockwave();
    }

    showNowPlaying(info, songChanged);

    // Pursue the track's theme color whenever we don't have one yet — not only
    // on song change — so the percentage reliably tints even if the artwork
    // (SMTC thumbnail or web fallback) arrives late or was missed.
    if (info.thumb && (songChanged || !themeColor)) {
      extractThemeColor(info.thumb, info.thumbType);
    } else if (!info.thumb && info.title && (songChanged || !themeColor)) {
      fetchAlbumArt(info.title, info.artist);   // cached; sets themeColor on success
    }

    // Re-assert the percentage color every poll so it stays tinted while the
    // song plays (and reverts to your chosen color when paused/stopped).
    applyThemeColor();
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

// ── Intelligent Bass Analysis (called every frame from animateStarfield) ──

function updateBassLevel() {
  if (!analyser || !musicEnabled || !bassFreqData) {
    bassLevel *= 0.9;
    bassSmooth *= 0.88;
    bassHit *= 0.85;
    peakBass *= 0.95;
    bassAvg *= 0.99;
    songAnalysis.smoothIntensity *= 0.95;
    return;
  }

  analyser.getByteFrequencyData(bassFreqData);

  // ── Frequency band analysis ──
  // Sub-bass (bins 0-1, ~0-375Hz) and bass (bins 2-4, ~375-940Hz)
  let subBass = 0;
  let bass = 0;
  let midEnergy = 0;
  let totalEnergy = 0;
  for (let i = 0; i < 2; i++) subBass += bassFreqData[i];
  for (let i = 0; i < 5; i++) bass += bassFreqData[i];
  for (let i = 5; i < 20; i++) midEnergy += bassFreqData[i];
  for (let i = 0; i < bassFreqData.length; i++) totalEnergy += bassFreqData[i];
  subBass /= (2 * 255);
  bass /= (5 * 255);
  midEnergy /= (15 * 255);
  totalEnergy /= (bassFreqData.length * 255);

  const rawBass = Math.min(1, subBass * 0.65 + bass * 0.35);

  // ── Energy profiling - learn the song's character ──
  songAnalysis.energyHistory.push(totalEnergy);
  if (songAnalysis.energyHistory.length > songAnalysis.energyHistoryMax) {
    songAnalysis.energyHistory.shift();
  }

  // Update median energy every ~30 frames for efficiency
  if (songAnalysis.energyHistory.length % 30 === 0 && songAnalysis.energyHistory.length > 30) {
    const sorted = [...songAnalysis.energyHistory].sort((a, b) => a - b);
    songAnalysis.medianEnergy = sorted[Math.floor(sorted.length * 0.5)];
    songAnalysis.energyFloor = sorted[Math.floor(sorted.length * 0.1)];
    if (totalEnergy > songAnalysis.peakEnergy) songAnalysis.peakEnergy = totalEnergy;
  }

  // Volume normalization: quiet songs get boosted, loud songs get tamed
  if (songAnalysis.medianEnergy > 0.01) {
    // Target median of ~0.25 - normalize around that
    const targetMedian = 0.25;
    songAnalysis.volumeNormFactor = songAnalysis.volumeNormFactor * 0.99 +
      (Math.min(2.5, Math.max(0.4, targetMedian / songAnalysis.medianEnergy))) * 0.01;
  }

  // ── Intro phase detection ──
  const timeSinceSongStart = Date.now() - songAnalysis.songStartTime;
  songAnalysis.introPhase = timeSinceSongStart < songAnalysis.introFadeDuration;

  // Intro ramp: starts at 0.3 (already noticeable), reaches 1 after introFadeDuration
  let introRamp = 1;
  if (songAnalysis.introPhase) {
    const t = Math.min(1, timeSinceSongStart / songAnalysis.introFadeDuration);
    introRamp = 0.3 + t * 0.7; // starts at 30% intensity, ramps to full
  }

  // ── Spectral flux onset detection (smarter than pure bass threshold) ──
  // Compare current spectrum to previous frame - detects ALL onsets, not just bass
  let flux = 0;
  const currentSpectrum = new Float32Array(bassFreqData.length);
  for (let i = 0; i < bassFreqData.length; i++) {
    currentSpectrum[i] = bassFreqData[i] / 255;
    if (songAnalysis.prevSpectrum) {
      const diff = currentSpectrum[i] - songAnalysis.prevSpectrum[i];
      if (diff > 0) flux += diff; // only positive flux (onset, not offset)
    }
  }
  songAnalysis.prevSpectrum = currentSpectrum;
  songAnalysis.spectralFlux = flux;

  // Adaptive flux threshold from recent history
  songAnalysis.fluxHistory.push(flux);
  if (songAnalysis.fluxHistory.length > songAnalysis.fluxHistoryMax) songAnalysis.fluxHistory.shift();
  let fluxMedian = 0;
  if (songAnalysis.fluxHistory.length > 10) {
    const sorted = [...songAnalysis.fluxHistory].sort((a, b) => a - b);
    fluxMedian = sorted[Math.floor(sorted.length * 0.7)]; // 70th percentile as threshold
  }

  const normalizedBass = Math.min(1, rawBass * songAnalysis.volumeNormFactor);

  // Running average
  bassAvg = bassAvg * 0.97 + normalizedBass * 0.03;

  // Combined onset: spectral flux AND bass transient for musical accuracy
  const transient = Math.max(0, normalizedBass - bassAvg * 0.85);
  const isFluxOnset = flux > fluxMedian * 1.4 && flux > 0.5;
  const isBassOnset = transient > 0.08;

  // Beat onset: either strong bass transient or significant spectral change
  const now = performance.now();
  const minBeatGap = 180; // max ~330 BPM
  const beatDetected = (isBassOnset || isFluxOnset) && (now - songAnalysis.lastBeatTime) > minBeatGap;

  if (beatDetected) {
    songAnalysis.beatTimes.push(now);
    songAnalysis.lastBeatTime = now;

    if (songAnalysis.beatTimes.length > 20) songAnalysis.beatTimes.shift();

    // BPM from beat intervals - cluster-based for accuracy
    if (songAnalysis.beatTimes.length >= 4) {
      const intervals = [];
      for (let i = 1; i < songAnalysis.beatTimes.length; i++) {
        intervals.push(songAnalysis.beatTimes[i] - songAnalysis.beatTimes[i - 1]);
      }
      intervals.sort((a, b) => a - b);

      // Use interquartile mean (remove outliers)
      const q1 = Math.floor(intervals.length * 0.25);
      const q3 = Math.floor(intervals.length * 0.75);
      let iqSum = 0, iqCount = 0;
      for (let i = q1; i <= q3; i++) {
        iqSum += intervals[i]; iqCount++;
      }
      const meanInterval = iqCount > 0 ? iqSum / iqCount : intervals[Math.floor(intervals.length / 2)];

      if (meanInterval > 0) {
        const detectedBPM = 60000 / meanInterval;
        if (detectedBPM >= 60 && detectedBPM <= 200) {
          songAnalysis.bpm = songAnalysis.bpm * 0.7 + detectedBPM * 0.3;
          songAnalysis.beatInterval = 60000 / songAnalysis.bpm;
          songAnalysis.bpmConfidence = Math.min(1, songAnalysis.beatTimes.length / 10);
          // Predict next beat
          songAnalysis.nextBeatTime = now + songAnalysis.beatInterval;
        }
      }
    }
  }

  // ── Beat phase (0-1 cycle synced to BPM) ──
  if (songAnalysis.beatInterval > 0 && songAnalysis.bpmConfidence > 0.3) {
    const timeSinceLastBeat = now - songAnalysis.lastBeatTime;
    songAnalysis.beatPhase = (timeSinceLastBeat % songAnalysis.beatInterval) / songAnalysis.beatInterval;
  }

  // ── Adaptive effect intensity ──
  // Combines: intro ramp + energy relative to song's own range + normalization
  let energyRelative = 0;
  if (songAnalysis.peakEnergy > songAnalysis.energyFloor + 0.01) {
    energyRelative = (totalEnergy - songAnalysis.energyFloor) /
      (songAnalysis.peakEnergy - songAnalysis.energyFloor);
    energyRelative = Math.max(0, Math.min(1, energyRelative));
  } else {
    energyRelative = Math.min(1, totalEnergy * 4);
  }

  // Effect intensity: intro ramp * energy position in song's own dynamic range
  // Songs that are consistently loud won't produce over-the-top effects
  // Songs that build up will naturally ramp the effects
  songAnalysis.effectIntensity = introRamp * (0.5 + energyRelative * 0.5);
  songAnalysis.smoothIntensity += (songAnalysis.effectIntensity - songAnalysis.smoothIntensity) * 0.12;

  // ── Apply to bass-reactive state (what the visuals use) ──
  bassLevel = normalizedBass;

  // bassHit: sharp impulse that decays fast - each beat is distinct
  if (transient > bassHit) {
    bassHit = transient; // instant attack
  } else {
    bassHit *= 0.82; // fast decay
  }

  // bassSmooth drives stars & glow - full intensity like original
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
  const screenScale = Math.max(1, Math.min(2, viewH / 800));
  const force = Math.min(14 * screenScale, intensity * 22 * screenScale);
  shakeY = -force;
  shakeVelocity = force * 0.6;

  // Spawn comet rarely on very strong kicks
  if (intensity > 0.6 && musicEnabled && Math.random() < 0.25) {
    spawnComet();
  }
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
