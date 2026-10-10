"use strict";

/* ============================================================
   1) الثوابت والألوان
   ============================================================ */
const THEME_CATALOG = [
  {
    id: "classic", name: "Classic Neon", subtitle: "النيون الكلاسيكي", description: "ألوان النيون الأصلية للعبة.", price: 0,
    colors: [
      { main: "#00e5ff", dark: "#006b8f" },
      { main: "#ff2fd0", dark: "#8f0080" },
      { main: "#ffc400", dark: "#8f6a00" },
      { main: "#7cff3d", dark: "#3a7a1a" }
    ],
    background: ["#060814", "#0a0d22", "#150b28"], accent: "#00e5ff", secondary: "#ff2fd0"
  },
  {
    id: "golden", name: "Golden Glow", subtitle: "التوهّج الذهبي", description: "درجات ذهبية دافئة بتوهّج معدني.", price: 30,
    colors: [
      { main: "#ffd166", dark: "#966500" },
      { main: "#ffae00", dark: "#895000" },
      { main: "#fff0a3", dark: "#9e8100" },
      { main: "#e9a900", dark: "#7a5500" }
    ],
    background: ["#100a03", "#211505", "#302004"], accent: "#ffd166", secondary: "#ffae00"
  },
  {
    id: "cyberpunk-red", name: "Cyberpunk Red", subtitle: "سايبربانك أحمر", description: "أحمر كهربائي مع لمسات بنفسجية مستقبلية.", price: 60,
    colors: [
      { main: "#ff315d", dark: "#8c1230" },
      { main: "#ff006e", dark: "#8b0040" },
      { main: "#ff5722", dark: "#8d260e" },
      { main: "#c000d4", dark: "#5e0069" }
    ],
    background: ["#08030b", "#1a0411", "#21081b"], accent: "#ff315d", secondary: "#c000d4"
  }
];

const DAILY_EVENTS = [
  {
    id: "double-coins",
    title: "تحدي العملات المضاعفة",
    detail: "كرات أسرع 15٪ · العملات ×2",
    icon: "✦",
    speedMultiplier: 1.15,
    coinMultiplier: 2,
    trickChanceBonus: 0,
    hazardBallMultiplier: 1,
    powerUpBallMultiplier: 1,
    regularMatchPointsMultiplier: 1
  },
  {
    id: "hazard-mania",
    title: "فوضى الكرات الخطرة",
    detail: "مخاطر أكثر · التفادي والمطابقة العادية ×2 نقاط",
    icon: "⚠",
    speedMultiplier: 1,
    coinMultiplier: 1,
    trickChanceBonus: 0.10,
    hazardBallMultiplier: 1.5,
    powerUpBallMultiplier: 1,
    regularMatchPointsMultiplier: 2
  },
  {
    id: "power-up-frenzy",
    title: "هوس القوى الخاصة",
    detail: "فرصة مضاعفة للقنابل وكرات التجميد",
    icon: "✹",
    speedMultiplier: 1,
    coinMultiplier: 1,
    trickChanceBonus: 0,
    hazardBallMultiplier: 1,
    powerUpBallMultiplier: 2,
    regularMatchPointsMultiplier: 1
  }
];
let dailyEventRefreshTimer = 0;

const COLORS = THEME_CATALOG[0].colors.map((color) => ({ ...color }));
let ACTIVE_THEME = THEME_CATALOG[0];

const STORAGE_KEY = "neonMatch_highScore_v1";
const COIN_STORAGE_KEY = "neonMatch_coins_v1";
const OWNED_THEMES_STORAGE_KEY = "neonMatch_ownedThemes_v1";
const EQUIPPED_THEME_STORAGE_KEY = "neonMatch_equippedTheme_v1";
const LEADERBOARD_STORAGE_KEY = "neonMatch_leaderboard_v1";
let playerCoins = 0;
let ownedThemes = new Set(["classic"]);
let equippedThemeId = "classic";
let leaderboardEntries = [];
const ORB_RADIUS = 15;           // نصف قطر الكرة
const PLAYER_H = 20;             // ارتفاع المنصّة
const BASE_VIEWPORT_WIDTH = 390;
const BASE_VIEWPORT_HEIGHT = 700;
const MIN_GAME_SCALE = 0.72;
const MAX_GAME_SCALE = 1.35;

/* ============================================================
   2) إعداد اللوحة القماشية
   ============================================================ */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let W = 0, H = 0, DPR = 1;
let GAME_SCALE = 1;
let bgGrad = null;

function resize() {
  const previousWidth = W || window.innerWidth;
  const previousScale = GAME_SCALE;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(1, Math.round(window.innerWidth));
  H = Math.max(1, Math.round(window.innerHeight));
  GAME_SCALE = clamp(
    Math.min(W / BASE_VIEWPORT_WIDTH, H / BASE_VIEWPORT_HEIGHT),
    MIN_GAME_SCALE,
    MAX_GAME_SCALE
  );

  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width  = "100%";
  canvas.style.height = "100%";

  // ضبط التحويل الأساسي ليدعم الشاشات عالية الدقة
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // خلفية متدرجة (تُنشأ مرة واحدة عند كل تغيير حجم)
  bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0,    ACTIVE_THEME.background[0]);
  bgGrad.addColorStop(0.55, ACTIVE_THEME.background[1]);
  bgGrad.addColorStop(1,    ACTIVE_THEME.background[2]);

  // إعادة ضبط موضع وحجم اللاعب
  player.w = clamp(W * 0.24, 82 * GAME_SCALE, 130 * GAME_SCALE);
  player.h = PLAYER_H * GAME_SCALE;
  player.speed = 760 * GAME_SCALE;
  player.y = H - Math.max(78 * GAME_SCALE, H * 0.13);
  player.x = clamp(player.x * (W / previousWidth), player.w / 2, W - player.w / 2);

  for (const orb of game.orbs) {
    orb.r = ORB_RADIUS * GAME_SCALE;
    orb.x = clamp(orb.x * (W / previousWidth), orb.r, W - orb.r);
    orb.vy *= GAME_SCALE / previousScale;
  }
}

window.addEventListener("resize", resize, { passive: true });
window.visualViewport?.addEventListener("resize", resize, { passive: true });
window.addEventListener("orientationchange", () => setTimeout(resize, 120));

/* ============================================================
   3) المحرّك الصوتي (Web Audio API) — أصوات مولّدة برمجيًا
   ============================================================ */
const Sound = (() => {
  let actx = null;

  /** تهيئة السياق الصوتي (يجب أن تُستدعى بعد تفاعل المستخدم) */
  function init() {
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        actx = null;
      }
    }
    if (actx && actx.state === "suspended") actx.resume();
  }

  /** توليد نغمة واحدة قابلة للتخصيص */
  function tone({ freq = 440, dur = 0.15, type = "sine", vol = 0.2, slideTo = null, delay = 0 }) {
    if (!actx) return;
    const t0 = actx.currentTime + delay;
    const osc = actx.createOscillator();
    const gain = actx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  return {
    init,
    /* التقاط ناجح — نغمة تصعد مع ارتفاع السلسلة */
    catch(combo) {
      const f = 480 + Math.min(combo, 14) * 42;
      tone({ freq: f, dur: 0.11, type: "triangle", vol: 0.17, slideTo: f * 1.9 });
    },
    /* التقاط خاطئ — طنين منخفض */
    wrong() {
      tone({ freq: 190, dur: 0.32, type: "sawtooth", vol: 0.22, slideTo: 62 });
    },
    /* تغيّر لون المنصّة */
    colorSwitch() {
      tone({ freq: 720, dur: 0.09, type: "square", vol: 0.07, slideTo: 1180 });
    },
    /* فتح لون جديد */
    unlock() {
      [660, 880, 1180].forEach((f, i) =>
        tone({ freq: f, dur: 0.16, type: "triangle", vol: 0.13, delay: i * 0.07 }));
    },
    /* بداية اللعبة */
    start() {
      [440, 620, 880].forEach((f, i) =>
        tone({ freq: f, dur: 0.15, type: "triangle", vol: 0.14, delay: i * 0.075 }));
    },
    /* نهاية اللعبة — هبوط درامي */
    gameOver() {
      [700, 540, 400, 260].forEach((f, i) =>
        tone({ freq: f, dur: 0.3, type: "triangle", vol: 0.18, delay: i * 0.13 }));
    },
    /* رقم قياسي جديد */
    highScore() {
      [523, 659, 784, 1047].forEach((f, i) =>
        tone({ freq: f, dur: 0.24, type: "triangle", vol: 0.15, delay: i * 0.1 }));
    }
  };
})();

/* ============================================================
   4) حالة اللعبة والكيانات
   ============================================================ */
const game = {
  state: "start",        // start | playing | over
  score: 0,
  best: 0,
  lives: 3,
  combo: 0,
  maxCombo: 0,
  elapsed: 0,            // الزمن الفعلي للعب (ثواني)
  freezeTimer: 0,
  coinsEarned: 0,
  speedBoostActive: false,
  masterModeActive: false,
  dailyEventId: "double-coins",

  difficulty: 1,
  fallSpeed: 160,
  spawnInterval: 0.9,
  spawnTimer: 0.5,

  targetColor: 0,        // لون المنصّة الحالي
  colorTimer: 6,
  colorDuration: 6,

  colorUnlocked: false,  // هل فُتح اللون الرابع؟
  shake: 0,              // شدة اهتزاز الشاشة
  orbs: [],
  particles: [],
  floaters: []
};

const player = {
  x: 0,
  y: 0,
  w: 110,
  h: PLAYER_H,
  speed: 760            // سرعة الحركة بالمفاتيح
};

let confetti = [];      // قصاصات الورق في شاشة النهاية
let flashRed = 0;       // وميض أحمر عند الإصابة
let time = 0;           // مؤقّت عام للحركات

/* ============================================================
   5) المدخلات (ماوس / لمس / لوحة مفاتيح)
   ============================================================ */
const keys = { left: false, right: false };
let pointerActive = false;
let pointerX = 0;

canvas.addEventListener("pointermove", (e) => {
  pointerX = e.clientX;
  pointerActive = true;
}, { passive: true });

canvas.addEventListener("pointerdown", (e) => {
  pointerX = e.clientX;
  pointerActive = true;
  Sound.init();
}, { passive: true });

// منع التمرير باللمس داخل اللوحة
canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

window.addEventListener("keydown", (e) => {
  const shopIsOpen = !shopScreen.classList.contains("hidden");
  const leaderboardIsOpen = !leaderboardScreen.classList.contains("hidden");
  if (shopIsOpen || leaderboardIsOpen) {
    if (e.code === "Escape") {
      e.preventDefault();
      if (leaderboardIsOpen) closeLeaderboard();
      else closeShop();
    }
    return;
  }

  switch (e.code) {
    case "ArrowLeft":
    case "KeyA":
      keys.left = true;
      pointerActive = false;
      e.preventDefault();
      break;
    case "ArrowRight":
    case "KeyD":
      keys.right = true;
      pointerActive = false;
      e.preventDefault();
      break;
    case "Space":
    case "Enter":
      e.preventDefault();
      if (game.state === "start" || game.state === "over") startGame();
      break;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft"  || e.code === "KeyA") keys.left  = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
});

/* ============================================================
   6) أدوات مساعدة
   ============================================================ */
const rand  = (min, max) => min + Math.random() * (max - min);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function vibrate(pattern) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try { navigator.vibrate(pattern); } catch (e) { /* الاهتزاز غير مدعوم أو محظور */ }
}

/** رسم مستطيل بزوايا دائرية (بديل متوافق مع كل المتصفحات) */
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

/** عدد الألوان المفعّلة حاليًا */
function activeColorCount() {
  return game.colorUnlocked ? 4 : 3;
}

/** مضاعف النقاط حسب السلسلة (حد أقصى ×5) */
function comboMultiplier() {
  return Math.min(5, 1 + Math.floor(game.combo / 6));
}

function getDailyEventForDate(date = new Date()) {
  const localDay = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const index = ((localDay % DAILY_EVENTS.length) + DAILY_EVENTS.length) % DAILY_EVENTS.length;
  return DAILY_EVENTS[index];
}

function getRunDailyEvent() {
  return DAILY_EVENTS.find((event) => event.id === game.dailyEventId) || getDailyEventForDate();
}

function refreshDailyEventBanner(date = new Date()) {
  const event = getDailyEventForDate(date);
  todayEventTitleEl.textContent = event.title;
  todayEventDetailEl.textContent = event.detail;
  todayEventIconEl.textContent = event.icon;
  todayEventBannerEl.dataset.event = event.id;
  todayEventBannerEl.setAttribute("aria-label", "حدث اليوم: " + event.title + ". " + event.detail);
  return event;
}

function scheduleDailyEventRefresh() {
  if (dailyEventRefreshTimer) clearTimeout(dailyEventRefreshTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  dailyEventRefreshTimer = setTimeout(() => {
    dailyEventRefreshTimer = 0;
    refreshDailyEventBanner();
    scheduleDailyEventRefresh();
  }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
}

/* ============================================================
   7) المؤثرات: الجزيئات، النصوص الطائرة، الكونفيتي
   ============================================================ */
function burst(x, y, colorIndex, count, speed) {
  const c = COLORS[colorIndex];
  const scaledSpeed = speed * GAME_SCALE;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp  = rand(scaledSpeed * 0.25, scaledSpeed);
    game.particles.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 40 * GAME_SCALE,
      life: rand(0.35, 0.8),
      maxLife: 0.8,
      size: rand(2, 5) * GAME_SCALE,
      color: Math.random() < 0.25 ? "#ffffff" : c.main
    });
  }
}

function updateParticles(dt) {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 620 * GAME_SCALE * dt;      // جاذبية متناسبة مع أبعاد الشاشة
    p.vx *= 0.97;          // مقاومة هواء
    p.life -= dt;
    if (p.life <= 0) game.particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of game.particles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12 * GAME_SCALE;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function addFloater(x, y, text, color) {
  game.floaters.push({ x, y, text, color, life: 0.95, maxLife: 0.95 });
}

function updateFloaters(dt) {
  for (let i = game.floaters.length - 1; i >= 0; i--) {
    const f = game.floaters[i];
    f.y -= 58 * GAME_SCALE * dt;
    f.life -= dt;
    if (f.life <= 0) game.floaters.splice(i, 1);
  }
}

function drawFloaters() {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const f of game.floaters) {
    const a = clamp(f.life / f.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = "900 " + (19 * GAME_SCALE) + "px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 16;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

/** توليد قصاصات الكونفيتي الاحتفالية */
function spawnConfetti(count) {
  for (let i = 0; i < count; i++) {
    confetti.push({
      x: rand(0, W),
      y: rand(-H * 0.6, -20 * GAME_SCALE),
      vx: rand(-70, 70) * GAME_SCALE,
      vy: rand(90, 260) * GAME_SCALE,
      w: rand(6, 13) * GAME_SCALE,
      h: rand(9, 17) * GAME_SCALE,
      rot: rand(0, Math.PI * 2),
      vr: rand(-8, 8),
      color: COLORS[Math.floor(Math.random() * COLORS.length)].main,
      life: rand(3.5, 6.5)
    });
  }
}

function updateConfetti(dt) {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.rot += c.vr * dt;
    c.vx *= 0.995;
    c.life -= dt;
    if (c.life <= 0 || c.y > H + 60 * GAME_SCALE) confetti.splice(i, 1);
  }
}

function drawConfetti() {
  for (const c of confetti) {
    ctx.save();
    ctx.globalAlpha = clamp(c.life / 1.2, 0, 1);
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 10 * GAME_SCALE;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

/* ============================================================
   8) منطق اللعب
   ============================================================ */

/** تحديث مستوى الصعوبة تدريجيًا */
function updateDifficulty() {
  const d = Math.min(8, 1 + game.elapsed / 22 + game.score / 420);
  const dailySpeedMultiplier = getRunDailyEvent().speedMultiplier;
  game.difficulty    = d;
  game.fallSpeed     = (145 + d * 29) * GAME_SCALE * (game.speedBoostActive ? 1.15 : 1) * dailySpeedMultiplier;
  const spawnRateMultiplier = game.masterModeActive ? 0.78 : 1;
  const minimumSpawnInterval = game.masterModeActive ? 0.22 : 0.30;
  game.spawnInterval = Math.max(minimumSpawnInterval, (0.95 - d * 0.072) * spawnRateMultiplier);
  game.colorDuration = Math.max(3.2, 8.5 - d * 0.66);      // مدة ثبات اللون
}

/** تحديد نوع الكرة حسب التقدم واحتمالات المستوى */
function chooseOrbType(roll) {
  const event = getRunDailyEvent();
  const trickBaseChance = game.masterModeActive ? 0.30 : game.score > 600 ? 0.15 : 0;
  const trickChance = Math.min(0.55, trickBaseChance + event.trickChanceBonus);
  if (roll < trickChance) return "trick";

  let cutoff = trickChance;
  if (game.score > 1000) {
    cutoff += 0.04;
    if (roll < cutoff) return "coin";
  }

  const powerUpChance = 0.05 * event.hazardBallMultiplier * event.powerUpBallMultiplier;
  cutoff += powerUpChance;
  if (roll < cutoff) return "bomb";
  cutoff += powerUpChance;
  if (roll < cutoff) return "freeze";
  return "normal";
}

/** توليد كرة جديدة مع ترجيح لون الهدف قليلًا */
function spawnOrb() {
  const n = activeColorCount();
  let colorIdx;
  const type = chooseOrbType(Math.random());

  if (Math.random() < 0.42) {
    // ترجيح: 42% من الكرات تحمل لون المنصّة الحالي
    colorIdx = game.targetColor;
  } else {
    const others = [];
    for (let i = 0; i < n; i++) if (i !== game.targetColor) others.push(i);
    colorIdx = others[Math.floor(Math.random() * others.length)];
  }

  const orbRadius = ORB_RADIUS * GAME_SCALE;
  const margin = orbRadius + 14 * GAME_SCALE;
  game.orbs.push({
    x: rand(margin, W - margin),
    y: -orbRadius * 2,
    r: orbRadius,
    vy: game.fallSpeed * rand(0.85, 1.2),
    color: colorIdx,
    type,
    wob: rand(0, Math.PI * 2)
  });
}

/** تبديل لون المنصّة */
function switchTargetColor() {
  const n = activeColorCount();
  let next;
  do {
    next = Math.floor(Math.random() * n);
  } while (next === game.targetColor && n > 1);

  game.targetColor = next;
  game.colorTimer  = game.colorDuration;

  // نبضة بصرية سريعة
  game.particles.push({
    x: player.x, y: player.y, vx: 0, vy: 0,
    life: 0.35, maxLife: 0.35, size: player.w * 0.55,
    color: COLORS[game.targetColor].main
  });

  Sound.colorSwitch();
}

/** تحديث حركة اللاعب */
function updatePlayer(dt) {
  if (keys.left || keys.right) {
    pointerActive = false;
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    player.x += dir * player.speed * dt;
  } else if (pointerActive) {
    // متابعة سلسة لمؤشر الماوس/اللمس
    const dx = pointerX - player.x;
    player.x += dx * Math.min(1, dt * 16);
  }

  const half = player.w / 2;
  player.x = clamp(player.x, half, W - half);
}

/** تفعيل عتبات التقدم عند تجاوز النقاط المطلوبة */
function updateMilestones() {
  if (game.score > 1000 && !game.speedBoostActive) {
    game.speedBoostActive = true;
    for (const orb of game.orbs) if (!orb.destroyed) orb.vy *= 1.15;
    showMilestoneBanner("Level 2: Speed Up!");
  }

  if (game.score > 1500 && !game.masterModeActive) {
    game.masterModeActive = true;
    showMilestoneBanner("Level 3: Master Mode!");
  }
}

/** معالجة التقاط كرة */
function onCatch(orb) {
  if (orb.type === "trick") {
    game.combo = 0;
    game.shake = Math.max(game.shake, 7);
    flashRed = Math.max(flashRed, 0.28);
    burst(orb.x, orb.y, orb.color, 18, 220);
    addFloater(orb.x, orb.y - 8 * GAME_SCALE, "Missed!", "#ff4268");
    Sound.wrong();
    updateHUD();
    return;
  }

  const isMatch = orb.color === game.targetColor;

  if (isMatch) {
    vibrate([30]);
    game.combo++;
    game.maxCombo = Math.max(game.maxCombo, game.combo);

    const mult = comboMultiplier();
    const basePoints = 10 * mult * (orb.type === "coin" ? 2 : 1);
    const event = getRunDailyEvent();
    const dailyPointMultiplier = event.id === "hazard-mania" && orb.type === "normal"
      ? event.regularMatchPointsMultiplier
      : 1;
    const pts = basePoints * dailyPointMultiplier;
    game.score += pts;
    awardCoins(Math.floor(basePoints / 10));

    addFloater(orb.x, orb.y - 8, "+" + pts, orb.type === "coin" ? "#ffd166" : COLORS[orb.color].main);
    if (orb.type === "coin") addFloater(orb.x, orb.y - 26 * GAME_SCALE, "2× BONUS", "#ffd166");
    burst(orb.x, orb.y, orb.color, 26, 280);

    if (orb.type === "bomb") {
      awardCoins(3);
      const cleared = detonateBomb(orb);
      if (cleared > 0) {
        const bonus = cleared * 8;
        game.score += bonus;
        awardCoins(Math.floor(bonus / 10));
        addFloater(orb.x, orb.y - 28 * GAME_SCALE, "+" + bonus, "#ffc400");
      }
    } else if (orb.type === "freeze") {
      awardCoins(3);
      game.freezeTimer = 5;
      burst(orb.x, orb.y, orb.color, 34, 240);
      addFloater(orb.x, orb.y - 26 * GAME_SCALE, "تباطؤ 5 ثوانٍ", "#00e5ff");
    }

    updateMilestones();

    if (game.combo > 0 && game.combo % 10 === 0) game.shake = 5; // مكافأة اهتزاز خفيف

    Sound.catch(game.combo);

    // فتح اللون الرابع عند بلوغ 250 نقطة
    if (!game.colorUnlocked && game.score >= 250) {
      game.colorUnlocked = true;
      addFloater(W / 2, H * 0.35, "لون جديد!", COLORS[3].main);
      Sound.unlock();
    }
  } else {
    // التقاط خاطئ → فقدان حياة
    game.lives--;
    game.combo = 0;
    game.shake = 17;
    flashRed = 0.75;

    burst(orb.x, orb.y, orb.color, 22, 320);
    addFloater(orb.x, orb.y - 8, "✕", "#ff2f6d");
    Sound.wrong();

    if (game.lives <= 0) {
      endGame();
      return;
    }
  }

  updateHUD();
}

/** انفجار القنبلة يزيل الكرات القريبة عند مطابقتها */
function detonateBomb(source) {
  const blastRadius = 150 * GAME_SCALE;
  const blastRadiusSquared = blastRadius * blastRadius;
  let cleared = 0;

  for (const orb of game.orbs) {
    if (orb.destroyed) continue;
    const dx = orb.x - source.x;
    const dy = orb.y - source.y;
    if (dx * dx + dy * dy <= blastRadiusSquared) {
      orb.destroyed = true;
      cleared++;
      burst(orb.x, orb.y, orb.color, 10, 220);
    }
  }

  burst(source.x, source.y, source.color, 54, 420);
  game.shake = Math.max(game.shake, 10);
  addFloater(source.x, source.y - 22 * GAME_SCALE, "انفجار!", "#ffc400");
  return cleared;
}

/** مكافأة تفادي كرة الخداع خلال حدث المخاطر فقط */
function rewardHazardDodge(orb) {
  if (getRunDailyEvent().id !== "hazard-mania") return;

  const points = 20; // ضعف نقاط المطابقة الأساسية مقابل تفادي الخطر بنجاح.
  game.score += points;
  awardCoins(Math.floor(points / 10));
  addFloater(clamp(orb.x, 28 * GAME_SCALE, W - 28 * GAME_SCALE), H - 36 * GAME_SCALE, "DODGE +" + points, "#ffcf70");
  updateMilestones();

  if (!game.colorUnlocked && game.score >= 250) {
    game.colorUnlocked = true;
    addFloater(W / 2, H * 0.35, "لون جديد!", COLORS[3].main);
    Sound.unlock();
  }
  updateHUD();
}

/** تحديث كل الكرات الساقطة */
function updateOrbs(dt) {
  const top    = player.y - player.h / 2;
  const bottom = player.y + player.h / 2;

  for (let i = game.orbs.length - 1; i >= 0; i--) {
    const o = game.orbs[i];
    if (o.destroyed) {
      game.orbs.splice(i, 1);
      continue;
    }

    o.y += o.vy * dt;
    o.wob += dt * 3.5;
    o.x += Math.sin(o.wob) * 8 * GAME_SCALE * dt;   // تمايل خفيف متناسب مع الشاشة

    // --- كشف التصادم مع المنصّة ---
    if (o.y + o.r > top && o.y - o.r < bottom &&
        Math.abs(o.x - player.x) < player.w / 2 + o.r * 0.85) {
      game.orbs.splice(i, 1);
      onCatch(o);
      if (game.state !== "playing") return;   // انتهت اللعبة
      continue;
    }

    // --- خرجت من أسفل الشاشة؛ تفادي كرة الخداع يكافأ في حدث المخاطر ---
    if (o.y - o.r > H) {
      game.orbs.splice(i, 1);
      if (o.type === "trick") rewardHazardDodge(o);
    }
  }

  game.orbs = game.orbs.filter((orb) => !orb.destroyed);
}

/** توليد الكرات حسب المؤقّت */
function updateSpawning(dt) {
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    spawnOrb();
    // تنويع بسيط في التوقيت لمنع النمطية
    game.spawnTimer = game.spawnInterval * rand(0.72, 1.28);
  }
}

/** مؤقّت تغيير اللون */
function updateColorTimer(dt) {
  game.colorTimer -= dt;
  if (game.colorTimer <= 0) switchTargetColor();
}

/* ============================================================
   9) الرسم
   ============================================================ */

/** الخلفية: شبكة نيون متحركة */
function drawGrid() {
  const gs = 62 * GAME_SCALE;
  const off = (time * 22 * GAME_SCALE) % gs;

  ctx.save();
  ctx.strokeStyle = "rgba(110, 150, 255, 0.055)";
  ctx.lineWidth = Math.max(0.75, GAME_SCALE);

  ctx.beginPath();
  for (let x = -gs + off; x < W + gs; x += gs) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = -gs + off; y < H + gs; y += gs) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  // توهّج سفلي خفيف
  const glow = ctx.createLinearGradient(0, H * 0.62, 0, H);
  glow.addColorStop(0, "rgba(0, 229, 255, 0)");
  glow.addColorStop(1, "rgba(0, 180, 255, 0.09)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, H * 0.62, W, H * 0.38);

  ctx.restore();
}

/** رسم الكرات الساقطة */
function drawOrbs() {
  for (const o of game.orbs) {
    if (o.type === "trick") {
      const pulse = 0.5 + 0.5 * Math.sin(time * 17 + o.wob);
      ctx.save();
      ctx.globalAlpha = 0.72 + pulse * 0.28;
      ctx.shadowColor = pulse > 0.55 ? "#ff4268" : "#76172d";
      ctx.shadowBlur = (8 + pulse * 16) * GAME_SCALE;
      const trickGlow = ctx.createRadialGradient(
        o.x - o.r * 0.3, o.y - o.r * 0.35, o.r * 0.08,
        o.x, o.y, o.r
      );
      trickGlow.addColorStop(0, "#60404a");
      trickGlow.addColorStop(0.55, "#1b1018");
      trickGlow.addColorStop(1, "#030308");
      ctx.fillStyle = trickGlow;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2 * GAME_SCALE;
      ctx.strokeStyle = pulse > 0.55 ? "#ff5578" : "#681a30";
      ctx.stroke();
      ctx.fillStyle = "#ffdbe3";
      ctx.font = "900 " + Math.max(9, o.r * 1.05) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", o.x, o.y);
      ctx.restore();
      continue;
    }

    if (o.type === "coin") {
      ctx.save();
      ctx.shadowColor = "#ffc400";
      ctx.shadowBlur = 24 * GAME_SCALE;
      const coinGlow = ctx.createRadialGradient(
        o.x - o.r * 0.35, o.y - o.r * 0.35, o.r * 0.08,
        o.x, o.y, o.r
      );
      coinGlow.addColorStop(0, "#fff8cf");
      coinGlow.addColorStop(0.5, "#ffd166");
      coinGlow.addColorStop(1, "#9c5d00");
      ctx.fillStyle = coinGlow;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff1a8";
      ctx.lineWidth = 1.5 * GAME_SCALE;
      ctx.stroke();
      ctx.fillStyle = "#603900";
      ctx.font = "900 " + Math.max(8, o.r * 0.9) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("2×", o.x, o.y);
      ctx.restore();
      continue;
    }

    const c = COLORS[o.color];

    ctx.save();
    ctx.shadowColor = c.main;
    ctx.shadowBlur = 22 * GAME_SCALE;

    const g = ctx.createRadialGradient(
      o.x - o.r * 0.35, o.y - o.r * 0.35, o.r * 0.1,
      o.x, o.y, o.r
    );
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.4, c.main);
    g.addColorStop(1, c.dark);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fill();

    if (o.type === "bomb" || o.type === "freeze") {
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 " + Math.max(10, o.r * 1.25) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = o.type === "bomb" ? "#ffc400" : "#b8f6ff";
      ctx.shadowBlur = 7 * GAME_SCALE;
      ctx.fillText(o.type === "bomb" ? "✹" : "❄", o.x, o.y);
    }
    ctx.restore();
  }
}

/** رسم المنصّة (اللاعب) */
function drawPlayer() {
  if (game.state === "start") return;

  const c = COLORS[game.targetColor];
  const x = player.x, y = player.y, w = player.w, h = player.h;

  ctx.save();

  // جسم المنصّة
  ctx.shadowColor = c.main;
  ctx.shadowBlur = 26 * GAME_SCALE;

  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();

  ctx.strokeStyle = c.main;
  ctx.lineWidth = 3 * GAME_SCALE;
  roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.stroke();

  // النواة المتوهجة في المنتصف
  ctx.shadowBlur = 34 * GAME_SCALE;
  ctx.fillStyle = c.main;
  ctx.beginPath();
  ctx.arc(x, y, h * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // قوس العدّ التنازلي لتغيّر اللون
  if (game.state === "playing") {
    const p = clamp(game.colorTimer / game.colorDuration, 0, 1);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, h * 1.55, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    ctx.strokeStyle = p < 0.28 ? "#ff2f6d" : "rgba(255, 255, 255, 0.65)";
    ctx.lineWidth = 3 * GAME_SCALE;
    ctx.lineCap = "round";
    ctx.shadowColor = p < 0.28 ? "#ff2f6d" : "rgba(255,255,255,0.7)";
    ctx.shadowBlur = 10 * GAME_SCALE;
    ctx.stroke();
    ctx.restore();
  }

  // خط الأرضية الوهمي
  ctx.save();
  ctx.strokeStyle = "rgba(120, 170, 255, 0.14)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8 * GAME_SCALE, 14 * GAME_SCALE]);
  ctx.beginPath();
  ctx.moveTo(0, player.y + 34 * GAME_SCALE);
  ctx.lineTo(W, player.y + 34 * GAME_SCALE);
  ctx.stroke();
  ctx.restore();
}

/** توهج جليدي خفيف أثناء تأثير كرة التجميد */
function drawFreezeEffect() {
  if (game.state !== "playing" || game.freezeTimer <= 0) return;
  const pulse = 0.025 + (Math.sin(time * 7) + 1) * 0.012;
  const inset = 8 * GAME_SCALE;

  ctx.save();
  ctx.fillStyle = "rgba(0, 229, 255, " + pulse + ")";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(110, 235, 255, 0.55)";
  ctx.lineWidth = 2 * GAME_SCALE;
  ctx.shadowColor = "#00e5ff";
  ctx.shadowBlur = 14 * GAME_SCALE;
  ctx.strokeRect(inset, inset, Math.max(0, W - inset * 2), Math.max(0, H - inset * 2));
  ctx.restore();
}

/** دورة الرسم الكاملة */
function render() {
  ctx.save();

  // اهتزاز الشاشة
  if (game.shake > 0.5) {
    const s = game.shake * GAME_SCALE;
    ctx.translate(rand(-s, s), rand(-s, s));
  }

  // الخلفية (نرسم أوسع قليلًا لتفادي فراغات الاهتزاز)
  ctx.fillStyle = bgGrad;
  const overscan = 30 * GAME_SCALE;
  ctx.fillRect(-overscan, -overscan, W + overscan * 2, H + overscan * 2);

  drawGrid();
  drawOrbs();
  drawPlayer();
  drawParticles();
  drawFloaters();
  drawConfetti();
  drawFreezeEffect();

  ctx.restore();

  // وميض أحمر عند الإصابة (بدون اهتزاز)
  if (flashRed > 0.01) {
    ctx.fillStyle = "rgba(255, 40, 90, " + (flashRed * 0.38) + ")";
    ctx.fillRect(0, 0, W, H);
  }
}

/* ============================================================
   10) حلقة اللعبة الرئيسية
   ============================================================ */
let lastTime = 0;

function loop(ts) {
  if (!lastTime) lastTime = ts;

  let dt = (ts - lastTime) / 1000;
  lastTime = ts;

  // تقييد الخطوة الزمنية لتجنّب القفزات عند تبديل التبويبات
  dt = Math.min(dt, 0.05);

  let simulationDt = dt;
  if (game.state === "playing" && game.freezeTimer > 0) {
    game.freezeTimer = Math.max(0, game.freezeTimer - dt);
    simulationDt = dt * 0.2;
  }

  time += simulationDt;

  // --- تحديثات عامة (تعمل في كل الحالات) ---
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 62);
  if (flashRed > 0)   flashRed = Math.max(0, flashRed - dt * 2.2);

  updateParticles(simulationDt);
  updateFloaters(simulationDt);
  updateConfetti(simulationDt);

  // --- منطق اللعب ---
  if (game.state === "playing") {
    game.elapsed += simulationDt;

    updateDifficulty();
    updatePlayer(dt); // تبقى حركة اللاعب مباشرة أثناء تأثير التجميد
    updateColorTimer(simulationDt);
    updateOrbs(simulationDt);
    updateSpawning(simulationDt);
  }

  render();
  requestAnimationFrame(loop);
}

/* ============================================================
   11) إدارة الواجهة (HUD / البداية / النهاية)
   ============================================================ */
const scoreEl      = document.getElementById("score");
const bestEl       = document.getElementById("best");
const comboEl      = document.getElementById("combo");
const livesEl      = document.getElementById("lives");
const bestStartEl  = document.getElementById("best-start");
const coinBalanceStartEl = document.getElementById("coin-balance-start");
const coinBalanceOverEl = document.getElementById("coin-balance-over");
const coinsEarnedEl = document.getElementById("coins-earned");
const shopCoinBalanceEl = document.getElementById("shop-coin-balance");

const startScreen  = document.getElementById("start-screen");
const overScreen   = document.getElementById("over-screen");
const shopScreen   = document.getElementById("shop-screen");
const todayEventBannerEl = document.getElementById("today-event-banner");
const todayEventTitleEl = document.getElementById("today-event-title");
const todayEventDetailEl = document.getElementById("today-event-detail");
const todayEventIconEl = document.getElementById("today-event-icon");
const shopItemsEl  = document.getElementById("shop-items");
const shopStatusEl = document.getElementById("shop-status");
const startBtn     = document.getElementById("start-btn");
const restartBtn   = document.getElementById("restart-btn");
const homeBtn      = document.getElementById("home-btn");
const shareBtn     = document.getElementById("share-btn");
const shopOpenBtn  = document.getElementById("shop-open-btn");
const shopCloseBtn = document.getElementById("shop-close-btn");
const leaderboardOpenBtn = document.getElementById("leaderboard-open-btn");
const leaderboardScreen = document.getElementById("leaderboard-screen");
const leaderboardListEl = document.getElementById("leaderboard-list");
const leaderboardCloseBtn = document.getElementById("leaderboard-close-btn");
const leaderboardEntryEl = document.getElementById("leaderboard-entry");
const nicknameInputEl = document.getElementById("nickname-input");
const leaderboardSaveBtn = document.getElementById("leaderboard-save-btn");
const nicknameHelpEl = document.getElementById("nickname-help");
const nicknameEntryStatusEl = document.getElementById("nickname-entry-status");
const leaderboardSavedEl = document.getElementById("leaderboard-saved");
const milestoneBannerEl = document.getElementById("milestone-banner");
let milestoneBannerQueue = [];
let milestoneBannerTimer = 0;

const finalScoreEl = document.getElementById("final-score");
const bestScoreEl  = document.getElementById("best-score");
const maxComboEl   = document.getElementById("max-combo");
const newRecordEl  = document.getElementById("new-record");

/** تحديث عناصر الواجهة العلوية */
function updateHUD() {
  scoreEl.textContent = game.score;
  bestEl.textContent  = game.best;

  if (game.combo >= 2) {
    comboEl.classList.remove("hidden");
    comboEl.textContent = "سلسلة ×" + comboMultiplier() + "  (" + game.combo + ")";
  } else {
    comboEl.classList.add("hidden");
  }

  renderLives();
}

/** رسم قلوب الحياة */
function renderLives() {
  let html = "";
  const total = 3;
  for (let i = 0; i < total; i++) {
    html += '<span class="life' + (i < game.lives ? "" : " off") + '"></span>';
  }
  livesEl.innerHTML = html;
}

/** قراءة أعلى نتيجة من التخزين المحلي */
function loadBest() {
  try {
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    game.best = Number.isFinite(saved) ? Math.max(0, saved) : 0;
  } catch (e) {
    // احتفظ بالقيمة الموجودة في الذاكرة إذا كان التخزين المحلي غير متاح.
  }
}

function updateCoinDisplays() {
  const balance = String(playerCoins);
  if (coinBalanceStartEl) coinBalanceStartEl.textContent = balance;
  if (coinBalanceOverEl) coinBalanceOverEl.textContent = balance;
  if (shopCoinBalanceEl) shopCoinBalanceEl.textContent = balance;
  if (coinsEarnedEl) coinsEarnedEl.textContent = String(game.coinsEarned);
}

function presentNextMilestoneBanner() {
  const message = milestoneBannerQueue.shift();
  if (!message) {
    milestoneBannerEl.classList.add("hidden");
    return;
  }

  milestoneBannerEl.textContent = message;
  milestoneBannerEl.classList.remove("hidden");
  milestoneBannerTimer = setTimeout(() => {
    milestoneBannerTimer = 0;
    if (milestoneBannerQueue.length) presentNextMilestoneBanner();
    else milestoneBannerEl.classList.add("hidden");
  }, 1800);
}

function showMilestoneBanner(message) {
  milestoneBannerQueue.push(message);
  if (!milestoneBannerTimer) presentNextMilestoneBanner();
}

function resetMilestoneBanner() {
  if (milestoneBannerTimer) clearTimeout(milestoneBannerTimer);
  milestoneBannerTimer = 0;
  milestoneBannerQueue = [];
  milestoneBannerEl.textContent = "";
  milestoneBannerEl.classList.add("hidden");
}

function persistShopState() {
  try {
    localStorage.setItem(COIN_STORAGE_KEY, String(playerCoins));
    localStorage.setItem(OWNED_THEMES_STORAGE_KEY, JSON.stringify([...ownedThemes]));
    localStorage.setItem(EQUIPPED_THEME_STORAGE_KEY, equippedThemeId);
  } catch (e) {
    // تستمر الجولة بالعمل حتى إذا كان التخزين المحلي غير متاح.
  }
}

function applyTheme(themeId, persist = true) {
  const theme = THEME_CATALOG.find((item) => item.id === themeId);
  if (!theme || !ownedThemes.has(theme.id)) return false;

  equippedThemeId = theme.id;
  ACTIVE_THEME = theme;
  COLORS.splice(0, COLORS.length, ...theme.colors.map((color) => ({ ...color })));
  document.documentElement.style.setProperty("--theme-accent", theme.accent);
  document.documentElement.style.setProperty("--theme-secondary", theme.secondary);

  if (W > 0 && H > 0) resize();
  if (persist) persistShopState();
  return true;
}

function loadShopState() {
  try {
    const savedCoins = parseInt(localStorage.getItem(COIN_STORAGE_KEY) || "0", 10);
    playerCoins = Number.isFinite(savedCoins) ? Math.max(0, savedCoins) : 0;
  } catch (e) {
    playerCoins = 0;
  }

  ownedThemes = new Set(["classic"]);
  try {
    const savedOwned = JSON.parse(localStorage.getItem(OWNED_THEMES_STORAGE_KEY) || "[]");
    const validIds = new Set(THEME_CATALOG.map((theme) => theme.id));
    if (Array.isArray(savedOwned)) {
      for (const id of savedOwned) if (validIds.has(id)) ownedThemes.add(id);
    }
  } catch (e) {
    // تجاهل بيانات المظاهر التالفة واحتفظ بالمظهر المجاني.
  }

  let savedEquipped = "classic";
  try { savedEquipped = localStorage.getItem(EQUIPPED_THEME_STORAGE_KEY) || "classic"; } catch (e) {}
  equippedThemeId = ownedThemes.has(savedEquipped) ? savedEquipped : "classic";
  applyTheme(equippedThemeId, false);
  updateCoinDisplays();
}

function awardCoins(amount) {
  const baseReward = Math.max(0, Math.floor(Number(amount) || 0));
  if (!baseReward) return;
  const reward = baseReward * getRunDailyEvent().coinMultiplier;
  playerCoins += reward;
  game.coinsEarned += reward;
  persistShopState();
  updateCoinDisplays();
}

function renderShop() {
  if (!shopItemsEl) return;
  shopItemsEl.innerHTML = THEME_CATALOG.map((theme) => {
    const owned = ownedThemes.has(theme.id);
    const equipped = equippedThemeId === theme.id;
    const insufficient = !owned && playerCoins < theme.price;
    const actionLabel = equipped ? "المظهر الحالي" : owned ? "تجهيز" : "شراء";
    const priceLabel = theme.price === 0 ? "مجاني" : theme.price + " عملة";
    const swatches = theme.colors.map((color) => '<span style="--swatch:' + color.main + '"></span>').join("");
    const affordHint = insufficient
      ? '<small class="shop-affordability">ينقصك ' + (theme.price - playerCoins) + ' عملة</small>'
      : "";

    return '<article class="shop-item-card' + (equipped ? ' is-equipped' : '') + '">' +
      '<div class="theme-swatches" aria-hidden="true">' + swatches + '</div>' +
      '<div class="shop-card-content">' +
        '<div class="shop-card-heading"><div><h3>' + theme.name + '</h3><p>' + theme.subtitle + '</p></div>' +
        '<span class="shop-price">' + priceLabel + '</span></div>' +
        '<p class="shop-card-description">' + theme.description + '</p>' +
        '<button class="shop-action' + (equipped ? ' is-equipped' : '') + '" type="button" data-theme-action="' + theme.id + '"' +
          ((equipped || insufficient) ? ' disabled' : '') + '>' + actionLabel + '</button>' + affordHint +
      '</div>' +
    '</article>';
  }).join("");
}

function handleThemeAction(themeId) {
  const theme = THEME_CATALOG.find((item) => item.id === themeId);
  if (!theme) return;

  if (!ownedThemes.has(themeId)) {
    const remaining = theme.price - playerCoins;
    if (remaining > 0) {
      shopStatusEl.textContent = "تحتاج إلى " + remaining + " عملة إضافية لشراء هذا المظهر.";
      return;
    }
    playerCoins -= theme.price;
    ownedThemes.add(themeId);
  }

  applyTheme(themeId, true);
  updateCoinDisplays();
  shopStatusEl.textContent = "تم تجهيز " + theme.name + " بنجاح.";
  renderShop();
}

function openShop() {
  shopStatusEl.textContent = "";
  renderShop();
  shopScreen.classList.remove("hidden");
  shopScreen.setAttribute("aria-hidden", "false");
  shopCloseBtn.focus();
}

function closeShop() {
  shopScreen.classList.add("hidden");
  shopScreen.setAttribute("aria-hidden", "true");
  shopOpenBtn.focus();
}

/** قبول اسم مستعار آمن فقط؛ لا بريد أو روابط أو معرّفات رقمية خالصة */
function sanitizeNickname(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || /[@.]/.test(normalized) || /https?:/i.test(normalized)) return "";

  const safe = Array.from(normalized)
    .filter((character) => /[\p{L}\p{N} _-]/u.test(character))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const limited = Array.from(safe).slice(0, 20).join("").trim();
  return /\p{L}/u.test(limited) ? limited : "";
}

function sortLeaderboard(entries) {
  return entries
    .map((entry, order) => {
      const nickname = sanitizeNickname(entry && entry.nickname);
      const score = Math.floor(Number(entry && entry.score));
      return nickname && Number.isFinite(score) && score > 0
        ? { nickname, score, order }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 5)
    .map(({ nickname, score }) => ({ nickname, score }));
}

function loadLeaderboard() {
  try {
    const saved = JSON.parse(localStorage.getItem(LEADERBOARD_STORAGE_KEY) || "[]");
    leaderboardEntries = Array.isArray(saved) ? sortLeaderboard(saved) : [];
  } catch (error) {
    leaderboardEntries = [];
  }
}

function persistLeaderboard(entries) {
  try {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch (error) {
    return false;
  }
}

function leaderboardQualifies(score) {
  return score > 0 && (leaderboardEntries.length < 5 || score >= leaderboardEntries[4].score);
}

function renderLeaderboard() {
  leaderboardListEl.replaceChildren();
  if (!leaderboardEntries.length) {
    const empty = document.createElement("p");
    empty.className = "leaderboard-empty";
    empty.textContent = "لا توجد نتائج بعد. ابدأ اللعب لتسجيل أول نتيجة.";
    leaderboardListEl.appendChild(empty);
    return;
  }

  leaderboardEntries.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row" + (index === 0 ? " is-first" : "");
    row.setAttribute("role", "listitem");

    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = String(index + 1).padStart(2, "0");

    const nickname = document.createElement("span");
    nickname.className = "leaderboard-name";
    nickname.textContent = entry.nickname;

    const score = document.createElement("strong");
    score.className = "leaderboard-score";
    score.textContent = String(entry.score);

    row.append(rank, nickname, score);
    leaderboardListEl.appendChild(row);
  });
}

function openLeaderboard() {
  loadLeaderboard();
  renderLeaderboard();
  leaderboardScreen.classList.remove("hidden");
  leaderboardScreen.setAttribute("aria-hidden", "false");
  leaderboardCloseBtn.focus();
}

function closeLeaderboard() {
  leaderboardScreen.classList.add("hidden");
  leaderboardScreen.setAttribute("aria-hidden", "true");
  leaderboardOpenBtn.focus();
}

function saveLeaderboardEntry() {
  const nickname = sanitizeNickname(nicknameInputEl.value);
  const score = Math.floor(Number(game.score) || 0);
  if (!nickname) {
    nicknameEntryStatusEl.textContent = "أدخل اسمًا مستعارًا من حروف، ويمكن إضافة أرقام أو مسافات.";
    nicknameInputEl.focus();
    return;
  }
  if (!leaderboardQualifies(score)) {
    leaderboardEntryEl.classList.add("hidden");
    leaderboardSavedEl.classList.add("hidden");
    return;
  }

  // إضافة النتيجة الجديدة أولًا تجعلها تكسر التعادل، مع الاحتفاظ بخمسة سجلات فقط.
  const updated = sortLeaderboard([{ nickname, score }, ...leaderboardEntries]);
  if (!persistLeaderboard(updated)) {
    nicknameEntryStatusEl.textContent = "تعذّر الحفظ على هذا الجهاز. تحقق من مساحة التخزين ثم حاول مجددًا.";
    return;
  }

  leaderboardEntries = updated;
  renderLeaderboard();
  nicknameInputEl.value = "";
  leaderboardEntryEl.classList.add("hidden");
  leaderboardSavedEl.classList.remove("hidden");
}

/** بدء / إعادة اللعبة */
function startGame() {
  Sound.init();
  Sound.start();
  resetMilestoneBanner();
  game.dailyEventId = refreshDailyEventBanner().id;

  // إعادة ضبط الحالة
  game.state        = "playing";
  game.score        = 0;
  game.lives        = 3;
  game.combo        = 0;
  game.maxCombo     = 0;
  game.elapsed      = 0;
  game.freezeTimer  = 0;
  game.coinsEarned  = 0;
  game.speedBoostActive = false;
  game.masterModeActive = false;
  game.difficulty   = 1;
  game.fallSpeed    = 160;
  game.spawnInterval = 0.9;
  game.spawnTimer   = 0.55;
  game.colorUnlocked = false;
  game.shake        = 0;

  game.orbs         = [];
  game.particles    = [];
  game.floaters     = [];
  confetti          = [];
  flashRed          = 0;

  game.targetColor  = Math.floor(Math.random() * 3);
  game.colorDuration = 6.5;
  game.colorTimer   = 6.5;

  player.x = W / 2;
  pointerX = W / 2;
  pointerActive = false;
  keys.left = keys.right = false;

  // إخفاء الشاشات
  startScreen.classList.add("hidden");
  overScreen.classList.add("hidden");
  newRecordEl.classList.add("hidden");
  leaderboardEntryEl.classList.add("hidden");
  leaderboardSavedEl.classList.add("hidden");
  nicknameInputEl.value = "";
  nicknameEntryStatusEl.textContent = "";

  updateHUD();
  updateCoinDisplays();
}

/** العودة إلى شاشة البداية مع مزامنة أعلى نتيجة من التخزين المحلي */
function returnToHome() {
  loadBest();
  refreshDailyEventBanner();
  game.state = "start";
  startScreen.classList.remove("hidden");
  overScreen.classList.add("hidden");
  newRecordEl.classList.add("hidden");
  bestStartEl.textContent = game.best;
  bestEl.textContent = game.best;
  bestScoreEl.textContent = game.best;
  updateHUD();
  updateCoinDisplays();
}

/** مشاركة النتيجة باستخدام نافذة المشاركة أو WhatsApp كخيار احتياطي */
function shareScore() {
  const message = "I scored " + game.score + " points in NEON MATCH! Can you beat my score?";
  const whatsappUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(message);

  if (typeof navigator.share === "function") {
    navigator.share({ title: "NEON MATCH", text: message })
      .catch((error) => {
        if (!error || error.name !== "AbortError") window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      });
  } else {
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }
}

/** إنهاء اللعبة */
function endGame() {
  resetMilestoneBanner();
  game.state = "over";
  game.freezeTimer = 0;
  vibrate([100, 50, 100]);

  const isNewRecord = game.score > game.best;
  if (isNewRecord) {
    game.best = game.score;
    try {
      localStorage.setItem(STORAGE_KEY, String(game.best));
    } catch (e) { /* قد يكون التخزين معطّلًا */ }
  }

  // مؤثرات النهاية
  game.shake = 26;
  flashRed = 1;
  spawnConfetti(isNewRecord ? 150 : 70);

  Sound.gameOver();
  if (isNewRecord) setTimeout(() => Sound.highScore(), 620);

  // تعبئة بيانات شاشة النهاية
  finalScoreEl.textContent = game.score;
  bestScoreEl.textContent  = game.best;
  maxComboEl.textContent   = game.maxCombo;
  coinsEarnedEl.textContent = game.coinsEarned;
  coinBalanceOverEl.textContent = playerCoins;

  loadLeaderboard();
  nicknameInputEl.value = "";
  nicknameEntryStatusEl.textContent = "";
  leaderboardSavedEl.classList.add("hidden");
  leaderboardEntryEl.classList.toggle("hidden", !leaderboardQualifies(game.score));

  if (isNewRecord) newRecordEl.classList.remove("hidden");

  updateHUD();

  // تأخير بسيط لإظهار الانفجار قبل ظهور الشاشة
  setTimeout(() => {
    if (game.state === "over") overScreen.classList.remove("hidden");
  }, 620);
}

/* ============================================================
   12) التهيئة والتشغيل
   ============================================================ */
startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);
homeBtn.addEventListener("click", returnToHome);
shareBtn.addEventListener("click", shareScore);
shopOpenBtn.addEventListener("click", openShop);
shopCloseBtn.addEventListener("click", closeShop);
leaderboardOpenBtn.addEventListener("click", openLeaderboard);
leaderboardCloseBtn.addEventListener("click", closeLeaderboard);
leaderboardSaveBtn.addEventListener("click", saveLeaderboardEntry);
leaderboardScreen.addEventListener("click", (event) => {
  if (event.target === leaderboardScreen) closeLeaderboard();
});
nicknameInputEl.addEventListener("input", () => {
  const raw = nicknameInputEl.value;
  const sanitized = sanitizeNickname(raw);
  const containsPrivateMarker = /[@.]|https?:/i.test(raw);
  nicknameInputEl.value = sanitized;
  nicknameEntryStatusEl.textContent = containsPrivateMarker
    ? "استخدم اسمًا مستعارًا فقط؛ لا يمكن إدخال بريد أو رابط."
    : raw && !sanitized
      ? "استخدم اسمًا مستعارًا يحتوي على حرف واحد على الأقل."
      : "";
});
shopScreen.addEventListener("click", (event) => {
  if (event.target === shopScreen) closeShop();
});
shopItemsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".shop-action");
  if (button && !button.disabled) handleThemeAction(button.dataset.themeAction);
});

// منع تمرير الصفحة عند اللمس على الأزرار
[startBtn, restartBtn, homeBtn, shareBtn, shopOpenBtn, shopCloseBtn, leaderboardOpenBtn, leaderboardCloseBtn, leaderboardSaveBtn].forEach(btn => {
  btn.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
});
nicknameInputEl.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });

// تسجيل عامل الخدمة لدعم التخزين المؤقت والعمل دون اتصال على HTTPS أو localhost.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" })
      .catch((error) => console.warn("تعذّر تسجيل Service Worker:", error));
  });
}

// تهيئة أولية
loadBest();
loadShopState();
loadLeaderboard();
refreshDailyEventBanner();
scheduleDailyEventRefresh();
resize();
player.x = W / 2;
bestStartEl.textContent = game.best;
bestEl.textContent = game.best;
renderLives();

window.addEventListener("focus", () => refreshDailyEventBanner());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshDailyEventBanner();
});

requestAnimationFrame(loop);
