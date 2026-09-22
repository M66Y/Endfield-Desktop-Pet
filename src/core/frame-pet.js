// 整帧桌宠共享模板：待机底图 + 单帧姿势动作（淡入-情绪节奏-淡出/持续态） + 穿透/拖拽/热区/预览框架
// 由各桌宠的 renderer.js 以 createFramePet({...}) 配置化接入，姿势曲线/特殊动作/预览编排为每宠差异。
// 帧规格约定（素材管线 pose_lib 产出）：帧高 640、角色高 632、底边锚定 feetY、逐帧水平居中。
import { PetRuntime } from './pet-runtime.js';

export function createFramePet(options = {}) {
  const {
    poseTable = {},         // { 动作id: {wind,raise,hold,fall,lean0,swayHz,swayAmp,rhyHz,rhyAmp,rhyDy} }
    starters = {},          // { 动作id: (api) => {...} } 特殊动作（api: {A, startPose}）
    heightLogical = 235,    // 跨宠比例对齐：目标角色高（逻辑px，与洁尔佩塔实测一致）
    widthLogical = 240,     // 过宽角色的收宽上限
    preview = 'auto',       // 'auto' 按 pet.json actions 自动编排 | 自定义 async (ctx) => {}
    accent = 'rgba(126,32,38,0.92)', // 占位卡底色
  } = options;

  const canvas = document.getElementById('pet');
  const ctx = canvas.getContext('2d');
  const PREVIEW = new URLSearchParams(location.search).get('preview') === '1';
  const M = window.PET_MANIFEST || { canvas: { w: 533, h: 640 }, feetY: 640, clips: {} }; // manifest 缺失兜底（脚手架期）
  const ASSETS = '../assets/pets/' + window.pet.petId + '/';
  const infoP = PetRuntime.init();

  // ---------- 坐标系：素材像素 -> 逻辑画布 256 ----------
  // 所有姿势帧与画布同规格（帧高 640、角色底边锚定 feetY、水平居中），逐帧底心锚定绘制
  const LOGICAL = 256;
  const BOTTOM_LY = 246; // 角色“接地”逻辑 y
  const CANVAS_W = (M.canvas && M.canvas.w) || 533;
  const CANVAS_H = (M.canvas && M.canvas.h) || 640;
  const FEET_Y = M.feetY || CANVAS_H;
  const F = Math.min(heightLogical / CANVAS_H, widthLogical / CANVAS_W);
  const AX = CANVAS_W / 2, AY = FEET_Y; // 底部中心锚点（素材坐标）
  const RAD = Math.PI / 180;

  // ---------- 姿势帧加载（manifest.clips；count=1 单帧姿势，count>1 帧序列循环播放） ----------
  const clipImgs = {};
  for (const name of Object.keys(M.clips || {})) {
    const c = M.clips[name];
    const frames = [];
    for (let i = 0; i < (c.count || 1); i++) {
      const im = new Image();
      im.src = ASSETS + name + '_' + String(i).padStart(2, '0') + '.' + (c.ext || 'webp');
      frames.push(im);
    }
    clipImgs[name] = frames;
  }
  const idleImg = (clipImgs.idle && clipImgs.idle[0]) || null;

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

  // ---------- 动画状态 ----------
  const A = {
    t: 0,
    press: false, drag: false,
    vx: 0, vy: 0, lean: 0, leanV: 0,
    pose: { name: null, t: 1e9 }, // t === 1e9 表示无姿势动作（待机）
    label: null, // { text, t, dur } 占位动作气泡（素材待接入）
    downSX: 0, downSY: 0, lastSX: 0, lastSY: 0, lastMoveT: 0,
  };

  function startPose(name) {
    if (!poseTable[name] || !clipImgs[name]) return false;
    A.pose.name = name;
    A.pose.t = 0;
    A.label = null;
    return true;
  }

  // 特殊动作入口（注册表与预览共用）：自定义 starter 优先，否则走姿势系统
  function startAction(id) {
    const custom = starters[id];
    if (custom) { custom({ A, startPose }); return true; }
    return startPose(id);
  }

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

    // 姿势动作时间线（拖拽即打断）：wind 预备下压 → raise 淡入 → hold 保持(节奏脉冲+帧序列循环) → fall 淡出
    let poseOut = null, windP = 0;
    if (A.pose.t < 1e9 && !A.drag) {
      A.pose.t += dt;
      const P = poseTable[A.pose.name], st = A.pose.t;
      const TOT = P.wind + P.raise + P.hold + P.fall; // hold=Infinity 时持续保持
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
          rhy = Math.pow(Math.max(0, s), 1.3) * P.rhyAmp;        // 耸动脉冲
          rhyDy = Math.max(0, -s) * (P.rhyDy || 0.8) * P.rhyAmp; // 回落下沉
        }
        // 帧序列（count>1）：hold 期间按 manifest fps 循环播放；淡入/淡出阶段停在第 0 帧
        const clip = M.clips[A.pose.name];
        let fi = 0;
        if (clip && clip.count > 1) {
          const inRaise = st2 < P.raise;
          const inFall = st2 >= P.raise + P.hold;
          const tCycle = Math.max(0, st2 - P.raise);
          fi = (inRaise || inFall) ? 0 : Math.floor(tCycle * (clip.fps || 1)) % clip.count;
        }
        poseOut = {
          name: A.pose.name, alpha: e, i: fi,
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

  function drawPlaceholderCard() {
    // 素材缺失时的兜底卡（仅脚手架阶段可见）
    const name = (PetRuntime.def && PetRuntime.def.name) || PetRuntime.petId;
    const w = 210, h = 160, x = (LOGICAL - w) / 2, y = 44;
    ctx.save();
    roundRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
    ctx.fillText(name, LOGICAL / 2, y + 40);
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText('待机素材缺失', LOGICAL / 2, y + 72);
    ctx.fillText('运行 idle_pack.py 生成', LOGICAL / 2, y + 92);
    ctx.restore();
  }

  // ---------- 帧绘制：底心锚定 + 呼吸/倾角/节奏变换 ----------
  function drawClipFrame(name, alpha, xf, fi = 0) {
    const frames = clipImgs[name];
    const im = frames && frames[fi];
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

  function render(p) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    if (!idleImg) { drawPlaceholderCard(); return; }

    if (p.pose) {
      // 姿势动作：整帧替换为姿势图（不与待机混排），保持期叠加情绪节奏/帧序列
      drawClipFrame(p.pose.name, p.pose.alpha, {
        lean: p.pose.lean,
        squeeze: p.pose.rhy * 0.004,
        stretch: p.pose.rhy * 0.006,
        dy: p.pose.rhyDy,
      }, p.pose.i || 0);
    } else {
      // 待机：呼吸缩放 + 摇摆 + 预备下压
      drawClipFrame('idle', 1, {
        lean: p.lean,
        squeeze: p.breath * 0.006,
        stretch: p.breath * 0.009 + p.windP * 0.004,
        dy: p.windP * 1.6,
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

  // ---------- 动作注册表（动作链见 pet.json；未接入素材的动作以气泡占位） ----------
  function buildRegistry() {
    const reg = PetRuntime.makeRegistry();
    const actions = (PetRuntime.def && PetRuntime.def.actions) || [];
    for (const a of actions) {
      reg.add({
        id: a.id,
        label: a.label,
        start: () => {
          if (!startAction(a.id)) A.label = { text: a.label, t: 0, dur: 2.4 };
        },
      });
    }
    PetRuntime.bindInput(reg);
    return reg;
  }

  // ---------- 预览框架 ----------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const STEP = 1 / 12;
  let pose = { t: 0, breath: 0, lean: 0 };

  async function autoPreview(pctx) {
    const { advance, still, snap, start } = pctx;
    await wait(600);
    advance(0.1);
    await still('idle');
    let n = 0;
    for (let i = 0; i < 30; i++, n++) await snap(n); // 待机 2.5s
    const actions = (PetRuntime.def && PetRuntime.def.actions) || [];
    for (const a of actions) {
      const P = poseTable[a.id];
      if (!P || !start(a.id)) continue; // 无曲线/无素材（气泡类）不进预览
      for (let i = 0; i < Math.round((P.wind + P.raise) / STEP) + 5; i++) advance(STEP);
      await still(a.id);
      const frames = P.hold === Infinity
        ? Math.round((P.wind + P.raise) / STEP) + 48 // 持续态：淡入 + 4 秒保持
        : Math.ceil((P.wind + P.raise + P.hold + P.fall) / STEP);
      for (let i = 0; i < frames; i++, n++) await snap(n);
    }
    pet.done();
  }

  function makePreviewCtx() {
    const pad = (n) => String(n).padStart(2, '0');
    return {
      pet, A, POSE: poseTable, def: PetRuntime.def, STEP, wait,
      advance: (dt) => { pose = update(dt); }, // 推进模块级 pose（主循环 render 读它）
      still: async (name) => { await wait(120); await pet.capture(name); },
      snap: async (i) => {
        pose = update(STEP);
        await new Promise((r) => requestAnimationFrame(r));
        await pet.capture('gif_' + pad(i));
      },
      start: startAction,
    };
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
    if (PREVIEW) {
      if (typeof preview === 'function') await preview(makePreviewCtx());
      else await autoPreview(makePreviewCtx());
    }
  }

  // 待机图异步就绪后重建热区
  if (idleImg) idleImg.onload = () => buildHitMask();
  start(); // 动态插入的 module 脚本，执行时 DOM 已就绪
}
