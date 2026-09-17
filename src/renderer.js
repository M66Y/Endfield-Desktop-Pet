// 洁尔佩塔桌宠 —— 原图分层纸偶渲染 / 状态机（idle / click / drag / shy）/ 键盘 Q 交替触发动作
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
function maybeReady() { if (loaded === total && clipLoaded === clipTotal) start(); }
for (const k of Object.keys(M.sprites)) {
  const im = new Image();
  im.onload = () => { loaded++; maybeReady(); };
  im.src = '../assets/' + M.sprites[k].img;
  imgs[k] = im;
}

// 视频帧序列动作（manifest.clips）：assets/<名字>_00.png ...
const clipImgs = {};
let clipLoaded = 0;
const clipTotal = Object.values(M.clips || {}).reduce((n, c) => n + c.count, 0);
for (const name of Object.keys(M.clips || {})) {
  clipImgs[name] = [];
  for (let i = 0; i < M.clips[name].count; i++) {
    const im = new Image();
    im.onload = im.onerror = () => { clipLoaded++; maybeReady(); };
    im.src = '../assets/' + name + '_' + String(i).padStart(2, '0') + '.' + (M.clips[name].ext || 'png');
    clipImgs[name].push(im);
  }
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
const SHY = { wind: 0.2, raise: 0.34, hold: 2.3, fall: 0.5 }; // 预备吸气+表情浮现+恢复
const CLIP = { fin: 0.15, fout: 0.25 };             // 帧序列动作淡入/淡出
const A = {
  t: 0, state: 'idle',
  blink: { next: rnd(1.5, 4), t: -1 },
  ear: { L: { next: rnd(2, 6), t: -1 }, R: { next: rnd(3, 7), t: -1 } },
  act: { type: 'none', t: 0, dur: 0, next: rnd(5, 9), dir: 1 },
  click: { t: 1e9, leg: 1 },
  shy: { t: 1e9 },
  clip: { t: 1e9 },
  press: false, drag: false,
  vx: 0, vy: 0, lean: 0, leanV: 0,
  tailPhase: 0,
  downSX: 0, downSY: 0, downT: 0, lastSX: 0, lastSY: 0, lastMoveT: 0,
};

function startKick() {
  A.state = 'kick';
  A.click.t = 0;
  A.shy.t = 1e9; // 踢腿会打断害羞
  A.clip.t = 1e9;
  A.click.leg *= -1;
  A.ear.L.t = 0; A.ear.L.next = A.t + rnd(3.5, 9);
  A.ear.R.t = 0.12; A.ear.R.next = A.t + rnd(3.5, 9);
}

function startShy() {
  A.shy.t = 0;
  A.clip.t = 1e9;
  A.act.next = A.t + SHY.raise + SHY.hold + SHY.fall + rnd(9, 16);
}

function startHappy() {
  const C = M.clips.happy;
  A.clip.t = 0;
  A.shy.t = 1e9;
  A.act.next = A.t + C.count / C.fps + rnd(9, 16);
}

// ---------- 键盘 Q：交替触发三个动作（主进程全局热键转发） ----------
let hotkeyNext = 0; // 0: 踢腿, 1: 害羞, 2: 开心
function playNextAction() {
  if (hotkeyNext === 0) { startKick(); hotkeyNext = 1; }
  else if (hotkeyNext === 1) { startShy(); hotkeyNext = 2; }
  else { startHappy(); hotkeyNext = 0; }
}
if (window.pet.onAction) window.pet.onAction(playNextAction);

function update(dt) {
  A.t += dt;
  const kickActive = A.state === 'kick';
  const dragging = A.drag;

  // 尾巴摆动（点击/小动作/害羞时加快）
  let wag = 1;
  if (kickActive) wag = 2.6;
  if (A.act.type === 'wag' && !kickActive && !dragging) wag = 2.6;
  if (A.shy.t < 1e9) wag = 2.1;
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

  // 待机小动作（偶尔害羞一次）
  const act = A.act;
  if (A.state === 'idle' && !A.press && !dragging && A.t > act.next && A.shy.t >= 1e9) {
    if (Math.random() < 0.16) {
      startShy();
    } else {
      const types = ['tilt', 'wag', 'perk'];
      act.type = types[(Math.random() * types.length) | 0];
      act.dur = act.type === 'tilt' ? 2.4 : 1.5;
      act.dir = Math.random() < 0.5 ? -1 : 1;
      act.t = 0;
      act.next = A.t + act.dur + rnd(6, 13);
    }
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

  // 踢腿动画：小跳 + 交替踢腿（不做表情替换）
  let kick = 0, hop = 0, clickLean = 0;
  if (kickActive) {
    A.click.t += dt;
    const ct = A.click.t;
    if (ct >= CLICK_DUR) { A.state = 'idle'; A.click.t = 1e9; }
    else {
      const sIn = ease(ct / 0.16);
      const sOut = ease((ct - 0.72) / 0.33);
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

  // 害羞: 预备吸气(纸偶) -> 整身参考图姿势(合手+害羞表情, 单帧 clip)淡入 -> 保持 -> 淡出
  let shyE = 0, shyLean = 0, shyClip = null;
  let windP = 0;
  if (A.shy.t < 1e9 && !dragging) {
    A.shy.t += dt;
    const st = A.shy.t;
    const TOT = SHY.wind + SHY.raise + SHY.hold + SHY.fall;
    if (st >= TOT) A.shy.t = 1e9;
    else if (st < SHY.wind) {
      windP = Math.sin((st / SHY.wind) * Math.PI);      // 预备帧: 吸气, 身体上提绷住
    } else {
      const st2 = st - SHY.wind;
      const r = ease(st2 / SHY.raise);
      const f = ease((st2 - SHY.raise - SHY.hold) / SHY.fall);
      shyE = Math.min(r, 1 - f);
      shyLean = -1.6 * shyE + shyE * Math.sin(st2 * Math.PI * 2 * 0.35) * 0.7;  // 缓慢后仰+轻摇(不做高频颤抖)
      if (M.clips.shy) shyClip = { name: 'shy', i: 0, alpha: shyE };
    }
  } else {
    A.shy.t = 1e9;
  }

  // 开心（视频帧序列）：整段播放, 前后淡入淡出; 拖拽即打断
  let clipPose = null;
  if (A.clip.t < 1e9 && !dragging) {
    A.clip.t += dt;
    const C = M.clips.happy;
    const dur = C.count / C.fps;
    if (A.clip.t >= dur + CLIP.fout) A.clip.t = 1e9;
    else {
      clipPose = {
        name: 'happy',
        i: Math.min(C.count - 1, Math.floor(A.clip.t * C.fps)),
        alpha: Math.min(1, A.clip.t / CLIP.fin, (dur + CLIP.fout - A.clip.t) / CLIP.fout),
      };
    }
  } else {
    A.clip.t = 1e9;
  }

  const breath = Math.sin(A.t * Math.PI * 2 / 3.4);
  const blinkP = B.t >= 0 ? Math.sin(Math.PI * clamp01(B.t / 0.15)) : 0;
  const idleSway = Math.sin(A.t * 0.9) * 0.8;

  const pose = {
    t: A.t,
    breath,
    lean: A.lean + idleSway + actLean + clickLean + shyLean,
    hop: -hop - windP * 4,
    blink: blinkP,
    kick, kickSide: A.click.leg,
    earL: earAng(A.ear.L), earR: -earAng(A.ear.R), perk: actPerk,
    tailL: Math.sin(A.tailPhase) * 1.2,
    tailR: Math.sin(A.tailPhase + 0.9) * 1.2,
    tailDyL: Math.sin(A.tailPhase * 1.3) * 1.8,
    tailDyR: Math.sin(A.tailPhase * 1.3 + 0.8) * 1.8,
    wagging: kickActive || (A.act.type === 'wag'),
    shyE, windP,
    clip: clipPose || shyClip,
  };
  return pose;
}

// ---------- 绘制 ----------
function drawPart(name, ang, dy = 0, alpha = 1, mirror = false) {
  const sp = M.sprites[name];
  if (alpha <= 0) return;
  if (alpha < 1) octx.globalAlpha = alpha;
  octx.save();
  if (mirror) { octx.translate(M.canvas.w, 0); octx.scale(-1, 1); } // 绕身体中线镜像
  if (!ang && !dy) {
    octx.drawImage(imgs[name], sp.ox, sp.oy);
  } else {
    const px = sp.ox + sp.pivot[0], py = sp.oy + sp.pivot[1];
    octx.translate(0, dy);
    octx.translate(px, py);
    octx.rotate(ang * RAD);
    octx.translate(-px, -py);
    octx.drawImage(imgs[name], sp.ox, sp.oy);
  }
  octx.restore();
  if (alpha < 1) octx.globalAlpha = 1;
}

function drawEyelid(side) {
  const r = M.eyes[side].rect;
  const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
  const rx = (r[2] - r[0]) / 2 + 3, ry = (r[3] - r[1]) / 2 + 4;
  const o = currentPose;
  const cap = 0.92 + 0.08 * (o.lid || 0);
  const amt = clamp01(o.blink) * cap;
  if (amt < 0.04) return;
  const yTop = cy - ry, yClose = yTop + amt * ry * 2;
  octx.save();
  // 沿眼睛轮廓裁出椭圆, 皮肤从上往下压, 不露出方框角
  octx.beginPath();
  octx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  octx.clip();
  octx.beginPath();
  octx.rect(cx - rx - 2, yTop - 6, rx * 2 + 4, yClose - yTop + 6);
  octx.fillStyle = col(SKIN[side]);
  octx.filter = 'blur(2px)';
  octx.fill();
  octx.filter = 'none';
  octx.fill();
  // 接近闭合时画弧形睫毛线(闭眼线)
  if (amt > 0.45) {
    const la = clamp01((amt - 0.45) / 0.4);
    octx.beginPath();
    octx.moveTo(cx - rx + 3, yClose - 3);
    octx.quadraticCurveTo(cx, yClose + 4, cx + rx - 3, yClose - 3);
    octx.strokeStyle = col(LASH, 0.9 * la);
    octx.lineWidth = 3.4;
    octx.lineCap = 'round';
    octx.stroke();
  }
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
  if (pose.clip) {
    // 帧序列/整身姿势: 整只角色替换为图片帧, 不与纸偶混排
    const C = M.clips[pose.clip.name];
    const im = clipImgs[pose.clip.name] && clipImgs[pose.clip.name][pose.clip.i];
    if (im && im.complete && im.naturalWidth > 0) {
      if (pose.clip.name === 'shy') {
        // 害羞整身姿势: 与纸偶同脚底锚点, 叠加呼吸/后仰轻摇/扭捏轻颤
        octx.translate(FEET_AX, FEET_AY);
        octx.rotate((pose.lean || 0) * RAD);
        octx.scale(1 - (pose.breath || 0) * 0.007, 1 + (pose.breath || 0) * 0.011);
        octx.translate(pose.hop || 0, 0);
        octx.translate(-FEET_AX, -FEET_AY);
      }
      octx.globalAlpha = pose.clip.alpha;
      octx.drawImage(im, C.ox, C.oy);
      octx.globalAlpha = 1;
    }
  } else {
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
    // 害羞只换表情贴片, 双手保持原位(画回挖孔, 与待机一致)
    drawPart('handL', 0, 0, 1);
    drawPart('handL', 0, 0, 1, true);
    drawPart('handR', 0, 0, 1);
  }

  // ---- 主画布：整体缩放绘制 ----
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  const order = ['tailL', 'tailR', 'base', 'legL', 'legR', 'earL', 'earR', 'handL', 'handR'];
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
      if (dxT * dxT + dyT * dyT > 49) { A.drag = true; A.state = 'drag'; A.shy.t = 1e9; }
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

addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('mouseup', (e) => {
  if (!A.press) return;
  A.press = false;
  if (A.drag) {
    A.drag = false; A.state = 'idle';
    A.leanV = A.vx * 0.06;
    A.vx = A.vy = 0;
    const p = toLogical(e.clientX, e.clientY);
    setIgnore(!hitTest(p.x, p.y));
  }
});

addEventListener('blur', () => {
  if (A.drag) { A.drag = false; A.state = 'idle'; A.vx = A.vy = 0; }
  A.press = false;
});

// ---------- 预览模式：输出静态姿势截图 + 动画 GIF 帧序列 ----------
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
  currentPose = { t: 4, breath: 0.3, lean: 0.8, shyE: 1, windP: 0, clip: { name: 'shy', i: 0, alpha: 1 } };
  await wait(120); await pet.capture('shy');
  currentPose = { t: 5, clip: { name: 'happy', i: 18, alpha: 1 } };
  await wait(120); await pet.capture('happy');
  // 动画 GIF：12fps，待机 + 踢腿 + 害羞 + 开心片段
  const STEP = 1 / 12;
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const pad = (n) => String(n).padStart(2, '0');
  A.t = 10; // 让待机小动作计时器就绪
  A.act.next = A.t + 200; // 预览待机段不触发小动作/害羞，保证 GIF 干净
  let n = 0;
  for (let i = 0; i < 30; i++, n++) {
    currentPose = update(STEP);
    await nextFrame(); await pet.capture('gif_' + pad(n));
  }
  startKick();
  for (let i = 30; i < 46; i++, n++) {
    currentPose = update(STEP);
    await nextFrame(); await pet.capture('gif_' + pad(n));
  }
  startShy();
  const shyFrames = Math.ceil((SHY.raise + SHY.hold + SHY.fall) / STEP);
  for (let i = 0; i < shyFrames; i++, n++) {
    currentPose = update(STEP);
    await nextFrame(); await pet.capture('gif_' + pad(n));
  }
  startHappy();
  for (let i = 0; i < 30; i++, n++) { // GIF 里截取开心片段前 2.5 秒(完整动作 6 秒太长)
    currentPose = update(STEP);
    await nextFrame(); await pet.capture('gif_' + pad(n));
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
