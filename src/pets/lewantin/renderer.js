// 莱万汀桌宠 —— 整帧模板配置：姿势曲线 + 特殊动作（持雪糕=待机同图） + 预览编排
// 通用能力（渲染/状态机/穿透/拖拽/热区/注册表/预览框架）在 src/core/frame-pet.js
// 键盘：Q 按链循环（持雪糕→吃雪糕→掉了委屈→生气抱臂→睡觉→被叫醒），Alt+1..6 直选（元数据见 pet.json）
import { createFramePet } from '../../core/frame-pet.js';

createFramePet({
  // 单帧姿势动作时间曲线：wind 预备下压 → raise 淡入 → hold 保持(节奏脉冲) → fall 淡出
  // lean0 保持期基础倾角；swayHz/Amp 慢摇；rhyHz/Amp/Dy 情绪节奏（吃=啃咬耸动，委屈=抽噎塌落…）
  poseTable: {
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
  },

  // 特殊动作：持雪糕 = 回到待机同图（后续素材可分化）
  starters: {
    hold_icecream: ({ A }) => { A.pose.t = 1e9; A.label = null; },
  },

  // 预览编排：六动作 hold 中段截静态图 + GIF 全链闭环（睡着后被叫醒）
  preview: async (ctx) => {
    const { wait, advance, still, snap, start, POSE, STEP, pet } = ctx;
    await wait(600);
    advance(0.1);
    await still('idle');
    start('eat_icecream');
    const P = POSE.eat_icecream;
    for (let i = 0; i < Math.round((P.wind + P.raise) / STEP) + 4; i++) advance(STEP);
    await still('eat_icecream');
    start('drop_sad');
    const D = POSE.drop_sad;
    for (let i = 0; i < Math.round((D.wind + D.raise) / STEP) + 5; i++) advance(STEP);
    await still('drop_sad');
    start('angry_arms');
    const G = POSE.angry_arms;
    for (let i = 0; i < Math.round((G.wind + G.raise) / STEP) + 5; i++) advance(STEP);
    await still('angry_arms');
    start('sleep_idle');
    const S = POSE.sleep_idle;
    for (let i = 0; i < Math.round((S.wind + S.raise) / STEP) + 6; i++) advance(STEP);
    await still('sleep_idle');
    start('wake_up');
    const W = POSE.wake_up;
    for (let i = 0; i < Math.round((W.wind + W.raise) / STEP) + 5; i++) advance(STEP);
    await still('wake_up');
    // GIF：待机 2.5s -> 吃雪糕 -> 委屈 -> 生气 -> 打瞌睡(淡入+慢呼吸，持续态不淡出) -> 被叫醒(闭环)
    let n = 0;
    for (let i = 0; i < 30; i++, n++) await snap(n);
    start('eat_icecream');
    for (let i = 0; i < Math.ceil((P.wind + P.raise + P.hold + P.fall) / STEP); i++, n++) await snap(n);
    start('drop_sad');
    for (let i = 0; i < Math.ceil((D.wind + D.raise + D.hold + D.fall) / STEP); i++, n++) await snap(n);
    start('angry_arms');
    for (let i = 0; i < Math.ceil((G.wind + G.raise + G.hold + G.fall) / STEP); i++, n++) await snap(n);
    start('sleep_idle');
    for (let i = 0; i < Math.round((S.wind + S.raise) / STEP) + 48; i++, n++) await snap(n); // 入睡 + 4 秒慢呼吸
    start('wake_up'); // 睡着后被叫醒，动作链闭环
    for (let i = 0; i < Math.ceil((W.wind + W.raise + W.hold + W.fall) / STEP); i++, n++) await snap(n);
    pet.done();
  },
});
