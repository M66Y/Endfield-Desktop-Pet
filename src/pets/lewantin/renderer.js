// 莱万汀桌宠 —— 整身帧渲染（待机底图 + 呼吸/摇摆 / 单帧姿势动作：淡入-情绪节奏-淡出）
// 动作链 6 项：持雪糕=待机同图；吃雪糕=整帧姿势（POSE 表）；其余素材待接入以气泡占位
// 键盘：Q 按链循环（持雪糕→吃雪糕→掉了委屈→生气抱臂→睡觉→被叫醒），Alt+1..6 直选（元数据见 pet.json）
import { PetRuntime } from '../../core/pet-runtime.js';

const canvas = document.getElementById('pet');
const ctx = canvas.getContext('2d');
const PREVIEW = new URLSearchParams(location.search).get('preview') === '1';
const M = window.PET_MANIFEST;
const ASSETS = '../assets/pets/lewantin/';
const infoP = PetRuntime.init();

// ---------- 坐标系：素材像素 -> 逻辑画布 256 ----------
// 所有姿势帧与画布同规格（帧高 640、角色底边锚定 feetY、水平居中），逐帧底心锚定绘制
const LOGICAL = 256;
const BOTTOM_LY = 246; // 角色“接地”逻辑 y（盘腿坐姿 = 帧底边）
const CANVAS_W = (M && M.canvas && M.canvas.w) || 533;
const CANVAS_H = (M && M.canvas && M.canvas.h) || 640;
const FEET_Y = (M && M.feetY) || CANVAS_H;
// 与洁尔佩塔比例对齐：目标角色高 = 洁尔佩塔实测 235 逻辑px（帧内角色高 632/640）
const F = Math.min(235 / CANVAS_H, 240 / CANVAS_W);
const AX = CANVAS_W / 2, AY = FEET_Y; // 底部中心锚点（素材坐标）
const RAD = Math.PI / 180;

// ---------- 姿势帧加载（manifest.clips，均为单帧整身图） ----------
const clipImgs = {};
for (const name of Object.keys((M && M.clips) || {})) {
  const im = new Image();
  im.src = ASSETS + name + '_00.' + (M.clips[name].ext || 'webp');
  clipImgs[name] = im;
}
const idleImg = clipImgs.idle || null;

let scale = 1; // 设备像素 / 逻辑像素
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  scale = canvas.width / LOGICAL;
  buildHitMask();
}
addEventListener('resize', resize);

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
// 逐帧底心锚定：帧宽可能不同（姿势收拢更窄），每帧独立水平居中；帧高统一 640
const frameX = (w) => (LOGICAL - w * F) / 2;
const frameTopY = BOTTOM_LY - CANVAS_H * F;

// ---------- 单帧姿势动作（参考洁尔佩塔 POSE 系统的时间曲线） ----------
// wind 待机预备（下压蓄力）→ raise 姿势淡入 → hold 保持（情绪节奏）→ fall 淡出回待机
// lean0 保持期基础前倾；swayHz/Amp 慢摇；rhyHz/Amp 情绪节奏脉冲（吃=啃咬耸动，委屈=抽噎耸肩+塌落）
const POSE = {
  eat_icecream: { wind: 0.22, raise: 0.32, hold: 2.8, fall: 0.5,
                  lean0: 0.8, swayHz: 0.4, swayAmp: 0.5, rhyHz: 1.6, rhyAmp: 1.0, rhyDy: 0.8 },
  drop_sad:     { wind: 0.25, raise: 0.42, hold: 3.2, fall: 0.7,
                  lean0: 1.2, swayHz: 0.5, swayAmp: 0.35, rhyHz: 1.1, rhyAmp: 1.2, rhyDy: 1.6 },
  angry_arms:   { wind: 0.2, raise: 0.38, hold: 3.0, fall: 0.6,
                  lean0: -0.6, swayHz: 0.7, swayAmp: 0.25, rhyHz: 0.9, rhyAmp: 1.1, rhyDy: 0.5 },
  // 睡觉待机：hold=Infinity 持续保持（不自动淡出），慢呼吸节奏；被 Q/数字键/拖拽打断
  sleep_idle:   { wind: 0.3, raise: 0.5, hold: Infinity, fall: 0.4,
                  lean0: 1.5, swayHz: 0.25, swayAmp: 0.3, rhyHz: 0.27, rhyAmp: 0.9, rhyDy: 0.7 },
  // 被叫醒：惊醒快速坐直淡入 -> 迷糊摇晃 + 揉眼小脉冲 -> 缓缓回神淡出
  wake_up:      { wind: 0.12, raise: 0.2, hold: 2.6, fall: 0.55,
                  lean0: 0, swayHz: 0.5, swayAmp: 0.8, rhyHz: 0.9, rhyAmp: 0.7, rhyDy: 0.4 },
};

// ---------- 动画状态 ----------
const A = {
  t: 0,
  press: false, drag: false,
  vx: 0, vy: 0, lean: 0, leanV: 0,
  pose: { name: 'eat_icecream', t: 1e9 }, // t === 1e9 表示无姿势动作（待机）
  label: null, // { text, t, dur } 占位动作气泡（素材待接入）
  downSX: 0, downSY: 0, lastSX: 0, lastSY: 0, lastMoveT: 0,
};

function startPose(name) {
  if (!POSE[name] || !clipImgs[name]) return false;
  A.pose.name = name;
  A.pose.t = 0;
  A.label = null;
  return true;
}
const startEat = () => startPose('eat_icecream');
const startDropSad = () => startPose('drop_sad');
const startAngryArms = () => startPose('angry_arms');
const startSleep = () => startPose('sleep_idle');
const startWake = () => startPose('wake_up');

function update(dt) {
  A.t += dt;

  // 拖拽惯性 / 松手回弹（与洁尔佩塔同手感）
  if (A.drag) {
    const target = Math.max(-15, Math.min(15, A.vx * 0.05));
    A.lean += (target - A.lean) * Math.min(1, dt * 12);
  } else {
    A.leanV += (-A.lean * 95 - A.leanV * 7.5) * dt;
    A.lean += A.leanV * dt;
  }

  if (A.label) {
    A.label.t += dt;
    if (A.label.t >= A.label.dur) A.label = null;
  }

  // 姿势动作时间线（拖拽即打断，与洁尔佩塔一致）
  let poseOut = null, windP = 0;
  if (A.pose.t < 1e9 && !A.drag) {
    A.pose.t += dt;
    const P = POSE[A.pose.name], st = A.pose.t;
    const TOT = P.wind + P.raise + P.hold + P.fall;
    if (st >= TOT) A.pose.t = 1e9;
    else if (st < P.wind) {
      windP = Math.sin((st / P.wind) * Math.PI); // 待机预备：整体轻微下压
    } else {
      const st2 = st - P.wind;
      const r = ease(st2 / P.raise);
      const f = ease((st2 - P.raise - P.hold) / P.fall);
      const e = Math.min(r, 1 - f);
      let rhy = 0, rhyDy = 0;
      if (P.rhyHz) {
        const s = Math.sin(st2 * Math.PI * 2 * P.rhyHz);
        rhy = Math.pow(Math.max(0, s), 1.3) * P.rhyAmp;      // 耸动脉冲（张口咬 / 抽噎耸肩）
        rhyDy = Math.max(0, -s) * (P.rhyDy || 0.8) * P.rhyAmp; // 回落下沉（收口 / 塌落）
      }
      poseOut = {
        name: A.pose.name, alpha: e,
        lean: P.lean0 * e + e * Math.sin(st2 * Math.PI * 2 * P.swayHz) * P.swayAmp,
        rhy, rhyDy,
      };
    }
  } else if (A.drag) {
    A.pose.t = 1e9; // 拖拽打断姿势
  }

  const breath = Math.sin(A.t * Math.PI * 2 / 3.8);
  const sway = Math.sin(A.t * 0.7) * 0.5;
  return { t: A.t, breath, lean: A.lean + sway, pose: poseOut, windP };
}

// ---------- 绘制 ----------
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawLabel(label) {
  // 逻辑坐标系下绘制（主画布），出现在角色头顶上方
  const a = Math.min(1, label.t / 0.2, (label.dur - label.t) / 0.4);
  if (a <= 0) return;
  ctx.font = '13px "Microsoft YaHei", sans-serif';
  const text = label.text + '（素材待接入）';
  const tw = ctx.measureText(text).width;
  const bw = tw + 26, bh = 30;
  const bx = (LOGICAL - bw) / 2;
  const by = Math.max(6, frameTopY - bh - 6);
  ctx.save();
  ctx.globalAlpha = a;
  roundRect(ctx, bx, by, bw, bh, 9);
  ctx.fillStyle = 'rgba(24,22,30,0.86)';
  ctx.fill();
  ctx.beginPath(); // 小尾尖
  ctx.moveTo(LOGICAL / 2 - 5, by + bh);
  ctx.lineTo(LOGICAL / 2 + 5, by + bh);
  ctx.lineTo(LOGICAL / 2, by + bh + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, LOGICAL / 2, by + bh / 2 + 1);
  ctx.restore();
}

function drawPlaceholderCard(text) {
  // 素材缺失时的兜底卡（仅骨架阶段可见）
  const w = 210, h = 160, x = (LOGICAL - w) / 2, y = 44;
  ctx.save();
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = 'rgba(126,32,38,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
  ctx.fillText('莱万汀', LOGICAL / 2, y + 40);
  ctx.font = '12px "Microsoft YaHei", sans-serif';
  ctx.fillText(text || '待机素材缺失', LOGICAL / 2, y + 72);
  ctx.fillText('运行 idle_pack.py 生成', LOGICAL / 2, y + 92);
  ctx.restore();
}

// ---------- 帧绘制：底心锚定 + 呼吸/倾角/啃咬节奏变换 ----------
function drawClipFrame(name, alpha, xf) {
  const im = clipImgs[name];
  if (!im || !im.complete || im.naturalWidth === 0) return false;
  const fw = im.naturalWidth; // 帧宽可能不同（姿势收拢更窄），逐帧水平居中
  const x0 = frameX(fw), y0 = frameTopY;
  const ax = LOGICAL / 2, ay = BOTTOM_LY; // 锚点：逻辑画布底部中心
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ax, ay);
  ctx.rotate((xf.lean || 0) * RAD);
  ctx.scale(1 - (xf.squeeze || 0), 1 + (xf.stretch || 0));
  ctx.translate(0, xf.dy || 0);
  ctx.drawImage(im, x0 - ax, y0 - ay, fw * F, CANVAS_H * F);
  ctx.restore();
  return true;
}

function render(pose) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingQuality = 'high';

  if (!idleImg) { drawPlaceholderCard(); return; }

  if (pose.pose) {
    // 姿势动作：整帧替换为姿势图（与洁尔佩塔同款不混排），保持期叠加啃咬节奏
    drawClipFrame(pose.pose.name, pose.pose.alpha, {
      lean: pose.pose.lean,
      squeeze: pose.pose.rhy * 0.004,
      stretch: pose.pose.rhy * 0.006,
      dy: pose.pose.rhyDy,
    });
  } else {
    // 待机：呼吸缩放 + 摇摆 + 预备下压
    drawClipFrame('idle', 1, {
      lean: pose.lean,
      squeeze: pose.breath * 0.006,
      stretch: pose.breath * 0.009 + pose.windP * 0.004,
      dy: pose.windP * 1.6,
    });
  }

  if (A.label) drawLabel(A.label);
}

// ---------- 点击热区（待机帧 alpha 遮罩） ----------
let hitMap = null, hitW = 0, hitH = 0;
function buildHitMask() {
  if (!idleImg || !idleImg.complete || idleImg.naturalWidth === 0) return;
  hitW = CANVAS_W; hitH = CANVAS_H;
  const off = document.createElement('canvas');
  off.width = hitW; off.height = hitH;
  const octx = off.getContext('2d', { willReadFrequently: true });
  octx.drawImage(idleImg, 0, 0); // 待机帧与画布同规格，直接铺
  hitMap = octx.getImageData(0, 0, hitW, hitH).data;
}
function hitTest(lx, ly) {
  if (!hitMap) return false;
  // 逻辑坐标 -> 待机帧素材坐标（帧底心锚定的逆变换），忽略摇摆小角
  const offX = frameX(idleImg.naturalWidth), offY = frameTopY;
  let ax = (lx - offX) / F, ay = (ly - offY) / F;
  const dx = ax - AX, dy = ay - AY;
  const a = -A.lean * RAD; // 仅按拖拽倾角反旋
  ax = AX + dx * Math.cos(a) - dy * Math.sin(a);
  ay = AY + dx * Math.sin(a) + dy * Math.cos(a);
  const x = Math.round(ax), y = Math.round(ay);
  if (x < 1 || y < 1 || x >= hitW - 1 || y >= hitH - 1) return false;
  for (const [ox, oy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
    if (hitMap[((y + oy) * hitW + (x + ox)) * 4 + 3] > 40) return true;
  }
  return false;
}

// ---------- 鼠标交互（悬停穿透切换 / 点击选中 / 拖拽） ----------
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
      if (dxT * dxT + dyT * dyT > 49) A.drag = true;
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
    const hit = hitTest(p.x, p.y);
    setIgnore(!hit);
    if (hit) PetRuntime.reportHover(); // 悬停命中：成为热键路由目标
  }
});

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  PetRuntime.reportSelect(); // 点击选中
  A.press = true; A.drag = false;
  A.downSX = A.lastSX = e.screenX;
  A.downSY = A.lastSY = e.screenY;
  A.lastMoveT = performance.now();
  setIgnore(false);
});

addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('mouseup', (e) => {
  if (!A.press) return;
  A.press = false;
  if (A.drag) {
    A.drag = false;
    A.leanV = A.vx * 0.06;
    A.vx = A.vy = 0;
    const p = toLogical(e.clientX, e.clientY);
    setIgnore(!hitTest(p.x, p.y));
  }
});

addEventListener('blur', () => {
  if (A.drag) { A.drag = false; A.vx = A.vy = 0; }
  A.press = false;
});

// ---------- 动作注册表（动作链见 pet.json；已接入的走姿势系统，未接入的以气泡占位） ----------
// starter 映射：id -> 实际动作函数；不在表中的动作显示"素材待接入"气泡
const STARTERS = {
  hold_icecream: () => { A.pose.t = 1e9; A.label = null; }, // 持雪糕 = 待机同图（后续素材可分化）
  eat_icecream: startEat,
  drop_sad: startDropSad,
  angry_arms: startAngryArms,
  sleep_idle: startSleep,
  wake_up: startWake,
};
function buildRegistry() {
  const reg = PetRuntime.makeRegistry();
  const actions = (PetRuntime.def && PetRuntime.def.actions) || [];
  for (const a of actions) {
    reg.add({
      id: a.id,
      label: a.label,
      start: () => {
        const fn = STARTERS[a.id];
        if (fn) fn();
        else A.label = { text: a.label, t: 0, dur: 2.4 };
      },
    });
  }
  PetRuntime.bindInput(reg);
  return reg;
}

// ---------- 预览模式 ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function runPreview() {
  await wait(600);
  pose = update(0.1); // 注意：推进模块级 pose（主循环 render 读它），不可用局部变量遮蔽
  await wait(120); await pet.capture('idle');
  const STEP = 1 / 12;
  const pad = (n) => String(n).padStart(2, '0');
  // 推进一帧 -> 等一个 rAF（主循环 render 画上最新 pose）-> 截图
  const snap = async (i) => {
    pose = update(STEP);
    await new Promise((r) => requestAnimationFrame(r));
    await pet.capture('gif_' + pad(i));
  };
  // 吃雪糕：快进到 hold 中段（姿势完全淡入 + 啃咬节奏进行中）截静态图
  startEat();
  const P = POSE.eat_icecream;
  for (let i = 0; i < Math.round((P.wind + P.raise) / STEP) + 4; i++) pose = update(STEP);
  await wait(120); await pet.capture('eat_icecream');
  // 委屈：同样快进到 hold 中段（低头淡入完成 + 抽噎节奏进行中）截静态图
  startDropSad();
  const D = POSE.drop_sad;
  for (let i = 0; i < Math.round((D.wind + D.raise) / STEP) + 5; i++) pose = update(STEP);
  await wait(120); await pet.capture('drop_sad');
  // 生气抱臂：快进到 hold 中段截静态图
  startAngryArms();
  const G = POSE.angry_arms;
  for (let i = 0; i < Math.round((G.wind + G.raise) / STEP) + 5; i++) pose = update(STEP);
  await wait(120); await pet.capture('angry_arms');
  // 打瞌睡：快进到入睡完成截静态图（持续态，无淡出）
  startSleep();
  const S = POSE.sleep_idle;
  for (let i = 0; i < Math.round((S.wind + S.raise) / STEP) + 6; i++) pose = update(STEP);
  await wait(120); await pet.capture('sleep_idle');
  // 被叫醒：快进到 hold 中段（惊醒淡入完成 + 迷糊摇晃进行中）截静态图
  startWake();
  const W = POSE.wake_up;
  for (let i = 0; i < Math.round((W.wind + W.raise) / STEP) + 5; i++) pose = update(STEP);
  await wait(120); await pet.capture('wake_up');
  // GIF：待机 2.5s -> 吃雪糕 -> 委屈 -> 生气 -> 打瞌睡(淡入+慢呼吸 ~4s，持续态不淡出)
  let n = 0;
  for (let i = 0; i < 30; i++, n++) await snap(n);
  startEat();
  const eatFrames = Math.ceil((P.wind + P.raise + P.hold + P.fall) / STEP);
  for (let i = 0; i < eatFrames; i++, n++) await snap(n);
  startDropSad();
  const sadFrames = Math.ceil((D.wind + D.raise + D.hold + D.fall) / STEP);
  for (let i = 0; i < sadFrames; i++, n++) await snap(n);
  startAngryArms();
  const angryFrames = Math.ceil((G.wind + G.raise + G.hold + G.fall) / STEP);
  for (let i = 0; i < angryFrames; i++, n++) await snap(n);
  startSleep();
  const sleepFrames = Math.round((S.wind + S.raise) / STEP) + 48; // 入睡 + 4 秒慢呼吸
  for (let i = 0; i < sleepFrames; i++, n++) await snap(n);
  startWake(); // 睡着后被叫醒，动作链闭环
  const wakeFrames = Math.ceil((W.wind + W.raise + W.hold + W.fall) / STEP);
  for (let i = 0; i < wakeFrames; i++, n++) await snap(n);
  pet.done();
}

// ---------- 主循环 ----------
let last = performance.now();
let pose = { t: 0, breath: 0, lean: 0 };
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  if (pending.dx || pending.dy) {
    pet.moveBy(pending.dx, pending.dy);
    pending.dx = pending.dy = 0;
  }
  if (!PREVIEW) pose = update(dt);
  render(pose);
  requestAnimationFrame(frame);
}

async function start() {

  await infoP;
  buildRegistry();
  PetRuntime.log('[boot] renderer ready, clips:', Object.keys(clipImgs).join(',') || 'none');
  resize();
  requestAnimationFrame(frame);
  if (PREVIEW) runPreview();
}

// 待机图异步就绪后重建热区
if (idleImg) idleImg.onload = () => buildHitMask();
start(); // 动态插入的 module 脚本，执行时 DOM 已就绪
