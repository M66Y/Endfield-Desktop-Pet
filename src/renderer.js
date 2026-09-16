// 洁尔佩塔桌宠 —— 原图分层纸偶渲染 / 状态机（idle / click / drag）/ 鼠标交互
// 所有动画都在“素材像素坐标系”里进行，零件来自 tools/process.py 的抠图产物
const canvas = document.getElementById('pet');
const ctx = canvas.getContext('2d');
const PREVIEW = new URLSearchParams(location.search).get('preview') === '1';
const M = window.PET_MANIFEST;

const LOGICAL = 256;      // 逻辑画布
const CHAR_H = 236;       // 角色在逻辑画布中的高度
const FEET_LY = 246;      // 脚底所在逻辑 y

const F = CHAR_H / M.canvas.h;                       // 素材px -> 逻辑px
const OFF_X = (LOGICAL - M.canvas.w * F) / 2;
const OFF_Y = FEET_LY - M.feetY * F;
const FEET_AX = M.canvas.w / 2, FEET_AY = Math.min(M.feetY, M.canvas.h);
const RAD = Math.PI / 180;

const imgs = {};
let loaded = 0;
const total = Object.keys(M.sprites).length;
for (const k of Object.keys(M.sprites)) {
  const im = new Image();
  im.onload = () => { if (++loaded === total) start(); };
  im.src = '../assets/' + M.sprites[k].img;
  imgs[k] = im;
}

// 颜色
const col = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const SKIN = { L: M.colors.skinL, R: M.colors.skinR, M: M.colors.skinM };
const LASH = M.colors.lash, MLINE = M.colors.mouthLine;

let scale = 1; // 设备像素 / 逻辑像素
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  scale = canvas.width / LOGICAL;
  buildHitMask();
}
addEventListener('resize', resize);

// ---------- 工具 ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// ---------- 动画状态 ----------
const CLICK_DUR = 1.05;
const KICK_ANG = 10;   // 踢腿角度（小踢腿，配合起跳）
const A = {
  t: 0, state: 'idle',
  blink: { next: rnd(1.5, 4), t: -1 },
  ear: { L: { next: rnd(2, 6), t: -1 }, R: { next: rnd(3, 7), t: -1 } },
  act: { type: 'none', t: 0, dur: 0, next: rnd(5, 9), dir: 1 },
  click: { t: 1e9, leg: 1 },
  press: false, drag: false,
  vx: 0, vy: 0, lean: 0, leanV: 0,
  tailPhase: 0,
  downSX: 0, downSY: 0, downT: 0, lastSX: 0, lastSY: 0, lastMoveT: 0,
};

function startClick() {
  A.state = 'click';
  A.click.t = 0;
  A.click.leg *= -1;
  A.ear.L.t = 0; A.ear.L.next = A.t + rnd(3.5, 9);
  A.ear.R.t = 0.12; A.ear.R.next = A.t + rnd(3.5, 9);
}

function update(dt) {
  A.t += dt;
  const clickActive = A.state === 'click';
  const dragging = A.drag;

  // 尾巴摆动（点击/小动作时加快）
  let wag = 1;
  if (clickActive) wag = 2.6;
  if (A.act.type === 'wag' && !clickActive && !dragging) wag = 2.6;
  A.tailPhase += dt * (Math.PI * 2 / 3.2) * wag;

  // 眨眼
  const B = A.blink;
  if (B.t < 0 && A.t > B.next && A.state === 'idle' && !A.press && !dragging) B.t = 0;
  if (B.t >= 0) {
    B.t += dt;
    if (B.t > 0.15) { B.t = -1; B.next = A.t + rnd(2.4, 6); }
  }

  // 狐耳抖动
  for (const e of [A.ear.L, A.ear.R]) {
    if (e.t < 0 && A.t > e.next) { e.t = 0; e.next = A.t + rnd(3.5, 9); }
    if (e.t >= 0) { e.t += dt; if (e.t > 0.4) e.t = -1; }
  }
  const earAng = (e) => e.t >= 0 ? Math.sin((e.t / 0.4) * Math.PI * 2) * 2.2 : 0;

  // 待机小动作
  const act = A.act;
  if (A.state === 'idle' && !A.press && !dragging && A.t > act.next) {
    const types = ['tilt', 'wag', 'perk'];
    act.type = types[(Math.random() * types.length) | 0];
    act.dur = act.type === 'tilt' ? 2.4 : 1.5;
    act.dir = Math.random() < 0.5 ? -1 : 1;
    act.t = 0;
    act.next = A.t + act.dur + rnd(6, 13);
  }
  let actLean = 0, actPerk = 0;
  if (act.type !== 'none') {
    act.t += dt;
    const p = act.t / act.dur;
    if (p >= 1) act.type = 'none';
    else {
      if (act.type === 'tilt') actLean = Math.sin(Math.PI * p) * 2.5 * act.dir;
      if (act.type === 'perk') actPerk = Math.sin(Math.PI * p);
    }
  }

  // 点击动画：坏笑 + 踢腿
  let smug = 0, kick = 0, hop = 0, clickLean = 0;
  if (clickActive) {
    A.click.t += dt;
    const ct = A.click.t;
    if (ct >= CLICK_DUR) { A.state = 'idle'; A.click.t = 1e9; }
    else {
      const sIn = ease(ct / 0.16);
      const sOut = ease((ct - 0.72) / 0.33);
      smug = sIn * (1 - sOut);
      kick = Math.sin(Math.PI * clamp01((ct - 0.08) / 0.55));
      hop = kick * 4;
      clickLean = kick * 2.2 * A.click.leg;
    }
  }

  // 拖拽惯性 / 松手回弹
  if (dragging) {
    const target = Math.max(-15, Math.min(15, A.vx * 0.05));
    A.lean += (target - A.lean) * Math.min(1, dt * 12);
  } else {
    A.leanV += (-A.lean * 95 - A.leanV * 7.5) * dt;
    A.lean += A.leanV * dt;
  }

  const breath = Math.sin(A.t * Math.PI * 2 / 3.4);
  const blinkP = B.t >= 0 ? Math.sin(Math.PI * clamp01(B.t / 0.15)) : 0;
  const idleSway = Math.sin(A.t * 0.9) * 0.8;

  const pose = {
    t: A.t,
    breath,
    lean: A.lean + idleSway + actLean + clickLean,
    hop: -hop,
    blink: blinkP,
    squint: 0,
    face: (M.faces && (clickActive ? M.faces.smug : dragging ? M.faces.happy : null)) || null,
    kick, kickSide: A.click.leg,
    earL: earAng(A.ear.L), earR: -earAng(A.ear.R), perk: actPerk,
    tailL: Math.sin(A.tailPhase) * 1.2,
    tailR: Math.sin(A.tailPhase + 0.9) * 1.2,
    tailDyL: Math.sin(A.tailPhase * 1.3) * 1.8,
    tailDyR: Math.sin(A.tailPhase * 1.3 + 0.8) * 1.8,
    wagging: clickActive || (A.act.type === 'wag'),
  };
  return pose;
}

// ---------- 绘制 ----------
function drawPart(name, ang, dy = 0) {
  const sp = M.sprites[name];
  if (!ang && !dy) { octx.drawImage(imgs[name], sp.ox, sp.oy); return; }
  const px = sp.ox + sp.pivot[0], py = sp.oy + sp.pivot[1];
  octx.save();
  octx.translate(px, py + dy);
  octx.rotate(ang * RAD);
  octx.translate(-px, -py - dy);
  octx.drawImage(imgs[name], sp.ox, sp.oy);
  octx.restore();
}

function drawEyelid(side) {
  const r = M.eyes[side].rect;
  const x0 = r[0] - 3, y0 = r[1] - 4, w = r[2] - r[0] + 6, h = r[3] - r[1] + 8;
  const o = currentPose;
  const coverA = clamp01(o.blink) * 0.92;
  const cov = Math.min(0.92, coverA) * h;
  if (cov < 2) return;
  const skin = SKIN[side];
  octx.save();
  octx.beginPath();
  octx.moveTo(x0, y0);
  octx.lineTo(x0 + w, y0);
  octx.lineTo(x0 + w, y0 + cov - 6);
  octx.quadraticCurveTo(x0 + w / 2, y0 + cov + 5, x0, y0 + cov - 6);
  octx.closePath();
  octx.fillStyle = col(skin);
  octx.filter = 'blur(2px)';
  octx.fill();
  octx.filter = 'none';
  octx.fill();
  octx.restore();

}

let currentPose = { blink: 0, squint: 0 };
const faceImgs = {};
if (M.faces) {
  for (const k of Object.keys(M.faces)) {
    const im = new Image();
    im.src = '../assets/' + M.faces[k].img;
    faceImgs[k] = im;
  }
}
function drawFace(pose) {
  if (!pose.face || !faceImgs[pose.face] || !faceImgs[pose.face].complete) return;
  const f = M.faces[pose.face];
  octx.drawImage(faceImgs[pose.face], f.x, f.y);
}

// 离屏合成：先按素材原分辨率把所有图层拼好，再一次性缩放到主画布。
// 直接分层画到主画布会因逐层缩放/旋转的边缘透明化在图层交界处漏出桌面（白色细缝）。
const off = document.createElement('canvas');
off.width = M.canvas.w; off.height = M.canvas.h;
const octx = off.getContext('2d');

function render(pose) {
  // ---- 离屏：素材像素坐标系 ----
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, off.width, off.height);
  const breath = pose.breath || 0;
  octx.translate(FEET_AX, FEET_AY);
  octx.rotate((pose.lean || 0) * RAD);
  octx.scale(1 - breath * 0.007, 1 + breath * 0.011);
  octx.translate(pose.hop || 0, 0);
  octx.translate(-FEET_AX, -FEET_AY);

  drawPart('tailL', pose.tailL, pose.tailDyL);
  drawPart('tailR', pose.tailR, pose.tailDyR);
  drawPart('base', 0);
  drawPart('legL', pose.kickSide < 0 ? pose.kick * KICK_ANG : 0);
  drawPart('legR', pose.kickSide > 0 ? -pose.kick * KICK_ANG : 0);
  drawPart('earL', pose.earL - (pose.perk || 0) * 2);
  drawPart('earR', pose.earR + (pose.perk || 0) * 2);
  drawEyelid('L');
  drawEyelid('R');
  drawFace(pose);

  // ---- 主画布：整体缩放绘制 ----
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (PREVIEW) {
    const s = Math.max(8, 16 * scale);
    for (let y = 0; y < canvas.height; y += s)
      for (let x = 0; x < canvas.width; x += s) {
        ctx.fillStyle = ((((x / s) | 0) + ((y / s) | 0)) % 2) ? '#e2e2e2' : '#f4f4f4';
        ctx.fillRect(x, y, s, s);
      }
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, OFF_X, OFF_Y, M.canvas.w * F, M.canvas.h * F);
}

// ---------- 点击热区（用静止姿势的 alpha 遮罩） ----------
let hitMap = null, hitW = 0, hitH = 0;
function buildHitMask() {
  if (loaded < total) return;
  hitW = M.canvas.w; hitH = M.canvas.h;
  const off = document.createElement('canvas');
  off.width = hitW; off.height = hitH;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const order = ['tailL', 'tailR', 'base', 'legL', 'legR', 'earL', 'earR'];
  for (const k of order) {
    const sp = M.sprites[k];
    octx.drawImage(imgs[k], sp.ox, sp.oy);
  }
  hitMap = octx.getImageData(0, 0, hitW, hitH).data;
}
function hitTest(lx, ly) {
  if (!hitMap) return false;
  // 逻辑坐标 -> 素材坐标（忽略 lean 倾斜，拖拽中不需要命中检测）
  let ax = (lx - OFF_X) / F, ay = (ly - OFF_Y) / F;
  const dx = ax - FEET_AX, dy = ay - FEET_AY;
  const a = -(currentPose.lean || 0) * RAD;
  ax = FEET_AX + dx * Math.cos(a) - dy * Math.sin(a);
  ay = FEET_AY + dx * Math.sin(a) + dy * Math.cos(a);
  const x = Math.round(ax), y = Math.round(ay);
  if (x < 1 || y < 1 || x >= hitW - 1 || y >= hitH - 1) return false;
  for (const [ox, oy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
    if (hitMap[((y + oy) * hitW + (x + ox)) * 4 + 3] > 40) return true;
  }
  return false;
}

// ---------- 鼠标交互 ----------
const pet = window.pet;
let ignoring = true;
const pending = { dx: 0, dy: 0 };
function setIgnore(v) {
  if (v !== ignoring) { ignoring = v; pet.ignore(v); }
}
function toLogical(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return { x: (cx - r.left) / r.width * LOGICAL, y: (cy - r.top) / r.height * LOGICAL };
}

canvas.addEventListener('mousemove', (e) => {
  if (A.press) {
    if (!A.drag) {
      const dxT = e.screenX - A.downSX, dyT = e.screenY - A.downSY;
      if (dxT * dxT + dyT * dyT > 49) { A.drag = true; A.state = 'drag'; }
    }
    if (A.drag) {
      const now = performance.now();
      const dtm = Math.max(8, now - A.lastMoveT);
      const ix = e.screenX - A.lastSX, iy = e.screenY - A.lastSY;
      pending.dx += ix; pending.dy += iy;
      A.vx = A.vx * 0.7 + (ix / dtm * 16) * 0.3;
      A.vy = A.vy * 0.7 + (iy / dtm * 16) * 0.3;
      A.lastSX = e.screenX; A.lastSY = e.screenY; A.lastMoveT = now;
    }
    setIgnore(false);
  } else {
    const p = toLogical(e.clientX, e.clientY);
    setIgnore(!hitTest(p.x, p.y));
  }
});

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  A.press = true; A.drag = false;
  A.downSX = A.lastSX = e.screenX;
  A.downSY = A.lastSY = e.screenY;
  A.lastMoveT = performance.now();
  A.downT = A.lastMoveT;
  setIgnore(false);
});

addEventListener('mouseup', (e) => {
  if (!A.press) return;
  A.press = false;
  if (A.drag) {
    A.drag = false; A.state = 'idle';
    A.leanV = A.vx * 0.06;
    A.vx = A.vy = 0;
    const p = toLogical(e.clientX, e.clientY);
    setIgnore(!hitTest(p.x, p.y));
  } else if (performance.now() - A.downT < 600) {
    startClick();
  }
});

addEventListener('blur', () => {
  if (A.drag) { A.drag = false; A.state = 'idle'; A.vx = A.vy = 0; }
  A.press = false;
});

// ---------- 预览模式：输出三张静态姿势截图 ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function runPreview() {
  await wait(600);
  currentPose = { t: 1.2, breath: 0.5, lean: 0, blink: 0, kick: 0, tailL: 1, tailR: -1, tailDyL: 2, tailDyR: -2 };
  await wait(120); await pet.capture('idle');
  currentPose = {
    t: 2, breath: 0.2, lean: 2.5, blink: 0,
    kick: 0.8, kickSide: 1, hop: -4, earL: 1.5, tailL: -2, tailR: -2, tailDyL: -3, tailDyR: -3,
  };
  await wait(120); await pet.capture('click');
  currentPose = {
    t: 3, breath: 0, lean: 13, blink: 0,
    kick: 0, tailL: -3, tailR: -3, tailDyL: -2, tailDyR: -2,
  };
  await wait(120); await pet.capture('drag');
  // 动画 GIF：12fps，先 2.5 秒待机，再完整一次点击动画
  const STEP = 1 / 12;
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const pad = (n) => String(n).padStart(2, '0');
  A.t = 10; // 让待机小动作计时器就绪
  for (let i = 0; i < 30; i++) {
    currentPose = update(STEP);
    await nextFrame(); await pet.capture('gif_' + pad(i));
  }
  startClick();
  for (let i = 30; i < 46; i++) {
    currentPose = update(STEP);
    await nextFrame(); await pet.capture('gif_' + pad(i));
  }
  pet.done();
}

// ---------- 主循环 ----------
let last = performance.now();
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  if (pending.dx || pending.dy) {
    pet.moveBy(pending.dx, pending.dy);
    pending.dx = pending.dy = 0;
  }
  if (!PREVIEW) currentPose = update(dt);
  render(currentPose);
  requestAnimationFrame(frame);
}

function start() {
  resize();
  requestAnimationFrame(frame);
  if (PREVIEW) runPreview();
}
