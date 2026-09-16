// 洁尔佩塔桌宠 —— Live2D 渲染路径(Cubism 4 + pixi-live2d-display)
// 透明窗口 / 视线跟随鼠标 / 点击命中 / 拖拽移动 / Q 键切换表情
// 用 --live2d 启动; 模型暂用官方示例 Haru, 绑骨完成后替换 assets/live2d 下的模型文件即可
/* global PIXI */
(async () => {
const pet = window.pet;
const canvas = document.getElementById('app');

const MODEL_URL = 'app://live2d/haru/haru_greeter_t03.model3.json';

(async () => {
  PIXI.settings.failIfMajorPerformanceCaveat = false;
  const app = new PIXI.Application({
    view: canvas,
    backgroundAlpha: 0,                       // 透明画布 -> 透明窗口
    width: innerWidth,
    height: innerHeight,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  window.addEventListener('resize', () => app.renderer.resize(innerWidth, innerHeight));

  const model = await PIXI.live2d.Live2DModel.from(MODEL_URL, {
    autoInteract: false,                      // 穿透窗口下自己管理命中/视线/点击
    autoFocus: false,
    autoUpdate: true,
  });
  app.stage.addChild(model);

  // 适配窗口: 等比缩放, 居中, 脚部贴底
  function fit() {
    const mw = model.internalModel.width || 1;
    const mh = model.internalModel.height || 1;
    const k = Math.min(innerWidth / mw, innerHeight / mh) * 1.35;
    model.scale.set(k);
    model.anchor?.set?.(0.5, 0.5);
    model.x = innerWidth / 2;
    model.y = innerHeight / 2 + innerHeight * 0.04;
  }
  fit();
  window.addEventListener('resize', fit);

  // ---- 表情/动作循环(Q 键与点击共用) ----
  const exprNames = (model.settings.expressions || []).map((e) => e.Name);
  let exprIdx = -1;
  function nextExpression() {
    if (!exprNames.length) return;
    exprIdx = (exprIdx + 1) % exprNames.length;
    model.expression(exprNames[exprIdx]);
  }

  // ---- 指针交互: 悬停命中 -> 收回穿透; 按住拖拽 -> 移动窗口; 原地点击 -> 切表情 ----
  const press = { on: false, sx: 0, sy: 0, dragging: false };
  let hover = false;

  function inside(x, y) {
    try {
      const b = model.getBounds();
      return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
    } catch (err) {
      return false;
    }
  }

  window.addEventListener('pointermove', (e) => {
    if (press.on) {
      const dx = e.screenX - press.sx, dy = e.screenY - press.sy;
      if (!press.dragging && dx * dx + dy * dy > 36) press.dragging = true;
      if (press.dragging) {
        pet.moveBy(e.screenX - press.sx, e.screenY - press.sy);
        press.sx = e.screenX; press.sy = e.screenY;
        pet.ignore(false);
      }
      return;
    }
    const hit = inside(e.clientX, e.clientY);
    if (hit !== hover) { hover = hit; pet.ignore(!hover); }
    if (hover) model.focus(e.clientX, e.clientY);   // 视线跟随鼠标
  });

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    press.on = true; press.dragging = false;
    press.sx = e.screenX; press.sy = e.screenY;
    pet.ignore(false);
  });

  window.addEventListener('pointerup', () => {
    if (!press.on) return;
    const wasDrag = press.dragging;
    press.on = false; press.dragging = false;
    if (!wasDrag) nextExpression();                 // 原地点击: 切换表情
    window.dispatchEvent(new Event('pointermove')); // 重新评估穿透
  });

  // ---- Q 键(主进程全局热键): 轮播表情 ----
  if (pet.onAction) pet.onAction(() => nextExpression());

  // 起始表情 + 提示
  nextExpression();
  console.log('[live2d] ready:', exprNames.length, 'expressions');
})().catch((err) => {
  console.error('[live2d] failed:', err);
  document.title = 'L2D-ERROR';
});
})();
