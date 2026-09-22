// 庄方宜桌宠 —— 整帧模板配置（动作链确定后在 poseTable/pet.json actions 逐个登记）
// 通用能力（渲染/状态机/穿透/拖拽/热区/注册表/预览框架）在 src/core/frame-pet.js
import { createFramePet } from '../../core/frame-pet.js';

createFramePet({
  // 单帧姿势动作时间曲线：wind 预备下压 → raise 淡入 → hold 保持(节奏脉冲) → fall 淡出
  // lean0 保持期基础倾角；swayHz/Amp 慢摇；rhyHz/Amp/Dy 情绪节奏脉冲（安静角色幅度偏小）
  poseTable: {
    // 害羞：双手捧颊 + 微低头，轻轻扭捏慢摇 + 小幅扭捏脉冲
    shy: { wind: 0.22, raise: 0.36, hold: 2.6, fall: 0.5,
           lean0: 1.0, swayHz: 0.55, swayAmp: 0.6, rhyHz: 0.9, rhyAmp: 0.5, rhyDy: 0.3 },
    // 疑惑：托腮呆滞 + 头顶问号，慢悠悠晃头琢磨 + 轻微"嗯…"下沉
    confused: { wind: 0.2, raise: 0.34, hold: 3.0, fall: 0.55,
                lean0: 0.8, swayHz: 0.3, swayAmp: 0.7, rhyHz: 0.5, rhyAmp: 0.4, rhyDy: 0.3 },
    // 比心：双手胸前比心 + 尾巴翘起，心跳式"扑通扑通"脉冲 + 轻快摇
    heart: { wind: 0.2, raise: 0.34, hold: 2.8, fall: 0.5,
             lean0: 0.6, swayHz: 0.6, swayAmp: 0.5, rhyHz: 1.1, rhyAmp: 0.8, rhyDy: 0.4 },
    // 生气：攥拳嘟嘴闷气，鼓腮帮子的闷气脉冲 + 硬邦邦小晃（安静角色的生气方式，幅度比莱万汀小）
    angry: { wind: 0.2, raise: 0.36, hold: 2.9, fall: 0.55,
             lean0: -0.4, swayHz: 0.6, swayAmp: 0.35, rhyHz: 0.8, rhyAmp: 0.9, rhyDy: 0.5 },
    // 开心：眯眼大笑 + 双手挥手"耶！"，难得的雀跃——快节奏小跳脉冲
    happy: { wind: 0.18, raise: 0.3, hold: 2.8, fall: 0.45,
             lean0: 0, swayHz: 0.8, swayAmp: 0.6, rhyHz: 1.4, rhyAmp: 0.7, rhyDy: 0.5 },
  },
  starters: {},    // { 动作id: (api) => {...} } 特殊动作
  preview: 'auto', // 按 pet.json actions 自动编排截图 + GIF
});
