"use strict";

/* ============================================================
   1) الثوابت والألوان
   ============================================================ */
const COLORS = [
  { main: "#00e5ff", dark: "#006b8f" },  // سماوي
  { main: "#ff2fd0", dark: "#8f0080" },  // ماجنتا
  { main: "#ffc400", dark: "#8f6a00" },  // عنبري
  { main: "#7cff3d", dark: "#3a7a1a" }   // أخضر لايم (يُفتح لاحقًا)
];

const STORAGE_KEY = "neonMatch_highScore_v1";
const ORB_RADIUS = 15;           // نصف قطر الكرة
const PLAYER_H = 20;             // ارتفاع المنصّة

/* ============================================================
   2) إعداد اللوحة القماشية
   ============================================================ */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let W = 0, H = 0, DPR = 1;
let bgGrad = null;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;

  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";

  // ضبط التحويل الأساسي ليدعم الشاشات عالية الدقة
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // خلفية متدرجة (تُنشأ مرة واحدة عند كل تغيير حجم)
  bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0,    "#060814");
  bgGrad.addColorStop(0.55, "#0a0d22");
  bgGrad.addColorStop(1,    "#150b28");

  // إعادة ضبط موضع وحجم اللاعب
  player.w = Math.min(130, Math.max(82, W * 0.24));
  player.y = H - Math.max(78, H * 0.13);
  player.x = Math.min(Math.max(player.w / 2, player.x), W - player.w / 2);
}

window.addEventListener("resize", resize);
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
  return Math.min(5, 1 + Math.floor(game.combo / 5));
}

/* ============================================================
   7) المؤثرات: الجزيئات، النصوص الطائرة، الكونفيتي
   ============================================================ */
function burst(x, y, colorIndex, count, speed) {
  const c = COLORS[colorIndex];
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp  = rand(speed * 0.25, speed);
    game.particles.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 40,
      life: rand(0.35, 0.8),
      maxLife: 0.8,
      size: rand(2, 5),
      color: Math.random() < 0.25 ? "#ffffff" : c.main
    });
  }
}

function updateParticles(dt) {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 620 * dt;      // جاذبية
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
    ctx.shadowBlur = 12;
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
    f.y -= 58 * dt;
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
    ctx.font = "900 19px 'Segoe UI', system-ui, sans-serif";
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
      y: rand(-H * 0.6, -20),
      vx: rand(-70, 70),
      vy: rand(90, 260),
      w: rand(6, 13),
      h: rand(9, 17),
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
    if (c.life <= 0 || c.y > H + 60) confetti.splice(i, 1);
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
    ctx.shadowBlur = 10;
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
  game.difficulty    = d;
  game.fallSpeed     = 140 + d * 27;                       // سرعة سقوط الكرات
  game.spawnInterval = Math.max(0.30, 0.95 - d * 0.072);   // معدّل التوليد
  game.colorDuration = Math.max(3.2, 8.5 - d * 0.66);      // مدة ثبات اللون
}

/** توليد كرة جديدة مع ترجيح لون الهدف قليلًا */
function spawnOrb() {
  const n = activeColorCount();
  let colorIdx;

  if (Math.random() < 0.42) {
    // ترجيح: 42% من الكرات تحمل لون المنصّة الحالي
    colorIdx = game.targetColor;
  } else {
    const others = [];
    for (let i = 0; i < n; i++) if (i !== game.targetColor) others.push(i);
    colorIdx = others[Math.floor(Math.random() * others.length)];
  }

  const margin = ORB_RADIUS + 14;
  game.orbs.push({
    x: rand(margin, W - margin),
    y: -ORB_RADIUS * 2,
    r: ORB_RADIUS,
    vy: game.fallSpeed * rand(0.85, 1.2),
    color: colorIdx,
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

/** معالجة التقاط كرة */
function onCatch(orb) {
  const isMatch = orb.color === game.targetColor;

  if (isMatch) {
    game.combo++;
    game.maxCombo = Math.max(game.maxCombo, game.combo);

    const mult = comboMultiplier();
    const pts  = 10 * mult;
    game.score += pts;

    addFloater(orb.x, orb.y - 8, "+" + pts, COLORS[orb.color].main);
    burst(orb.x, orb.y, orb.color, 14, 230);

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

/** تحديث كل الكرات الساقطة */
function updateOrbs(dt) {
  const top    = player.y - player.h / 2;
  const bottom = player.y + player.h / 2;

  for (let i = game.orbs.length - 1; i >= 0; i--) {
    const o = game.orbs[i];

    o.y += o.vy * dt;
    o.wob += dt * 3.5;
    o.x += Math.sin(o.wob) * 8 * dt;   // تمايل خفيف

    // --- كشف التصادم مع المنصّة ---
    if (o.y + o.r > top && o.y - o.r < bottom &&
        Math.abs(o.x - player.x) < player.w / 2 + o.r * 0.85) {
      game.orbs.splice(i, 1);
      onCatch(o);
      if (game.state !== "playing") return;   // انتهت اللعبة
      continue;
    }

    // --- خرجت من أسفل الشاشة ---
    if (o.y - o.r > H) game.orbs.splice(i, 1);
  }
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
  const gs = 62;
  const off = (time * 22) % gs;

  ctx.save();
  ctx.strokeStyle = "rgba(110, 150, 255, 0.055)";
  ctx.lineWidth = 1;

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
    const c = COLORS[o.color];

    ctx.save();
    ctx.shadowColor = c.main;
    ctx.shadowBlur = 22;

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
  ctx.shadowBlur = 26;

  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();

  ctx.strokeStyle = c.main;
  ctx.lineWidth = 3;
  roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.stroke();

  // النواة المتوهجة في المنتصف
  ctx.shadowBlur = 34;
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
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.shadowColor = p < 0.28 ? "#ff2f6d" : "rgba(255,255,255,0.7)";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
  }

  // خط الأرضية الوهمي
  ctx.save();
  ctx.strokeStyle = "rgba(120, 170, 255, 0.14)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 14]);
  ctx.beginPath();
  ctx.moveTo(0, player.y + 34);
  ctx.lineTo(W, player.y + 34);
  ctx.stroke();
  ctx.restore();
}

/** دورة الرسم الكاملة */
function render() {
  ctx.save();

  // اهتزاز الشاشة
  if (game.shake > 0.5) {
    const s = game.shake;
    ctx.translate(rand(-s, s), rand(-s, s));
  }

  // الخلفية (نرسم أوسع قليلًا لتفادي فراغات الاهتزاز)
  ctx.fillStyle = bgGrad;
  ctx.fillRect(-30, -30, W + 60, H + 60);

  drawGrid();
  drawOrbs();
  drawPlayer();
  drawParticles();
  drawFloaters();
  drawConfetti();

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

  time += dt;

  // --- تحديثات عامة (تعمل في كل الحالات) ---
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 62);
  if (flashRed > 0)   flashRed = Math.max(0, flashRed - dt * 2.2);

  updateParticles(dt);
  updateFloaters(dt);
  updateConfetti(dt);

  // --- منطق اللعب ---
  if (game.state === "playing") {
    game.elapsed += dt;

    updateDifficulty();
    updatePlayer(dt);
    updateColorTimer(dt);
    updateOrbs(dt);
    updateSpawning(dt);
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

const startScreen  = document.getElementById("start-screen");
const overScreen   = document.getElementById("over-screen");
const startBtn     = document.getElementById("start-btn");
const restartBtn   = document.getElementById("restart-btn");
const homeBtn      = document.getElementById("home-btn");

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

/** بدء / إعادة اللعبة */
function startGame() {
  Sound.init();
  Sound.start();

  // إعادة ضبط الحالة
  game.state        = "playing";
  game.score        = 0;
  game.lives        = 3;
  game.combo        = 0;
  game.maxCombo     = 0;
  game.elapsed      = 0;
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

  updateHUD();
}

/** العودة إلى شاشة البداية مع مزامنة أعلى نتيجة من التخزين المحلي */
function returnToHome() {
  loadBest();
  game.state = "start";
  startScreen.classList.remove("hidden");
  overScreen.classList.add("hidden");
  newRecordEl.classList.add("hidden");
  bestStartEl.textContent = game.best;
  bestEl.textContent = game.best;
  bestScoreEl.textContent = game.best;
  updateHUD();
}

/** إنهاء اللعبة */
function endGame() {
  game.state = "over";

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

// منع تمرير الصفحة عند اللمس على الأزرار
[startBtn, restartBtn, homeBtn].forEach(btn => {
  btn.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
});

// تسجيل عامل الخدمة لدعم التخزين المؤقت والعمل دون اتصال على HTTPS أو localhost.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" })
      .catch((error) => console.warn("تعذّر تسجيل Service Worker:", error));
  });
}

// تهيئة أولية
loadBest();
resize();
player.x = W / 2;
bestStartEl.textContent = game.best;
bestEl.textContent = game.best;
renderLives();

requestAnimationFrame(loop);
