// 汤汤桌宠 —— 整帧模板配置（动作链确定后在 poseTable/pet.json actions 逐个登记）
// 通用能力（渲染/状态机/穿透/拖拽/热区/注册表/预览框架）在 src/core/frame-pet.js
import { createFramePet } from '../../core/frame-pet.js';

createFramePet({
  // 单帧姿势动作时间曲线：wind 预备下压 → raise 淡入 → hold 保持(节奏脉冲/帧序列循环) → fall 淡出
  poseTable: {
    // 打哈欠：三帧序列（犯困预备→捂嘴哈欠→收势）hold 期 1.2fps 循环播放，慢悠悠的困意
    yawn: { wind: 0.3, raise: 0.4, hold: 4.6, fall: 0.6,
            lean0: 0.6, swayHz: 0.35, swayAmp: 0.6, rhyHz: 0, rhyAmp: 0, rhyDy: 0 },
    // 开心蹦跳：四帧序列（下蹲蓄力→腾空挥手→最高点星星→落地）2fps 循环，帧内自带跳跃位移
    hop: { wind: 0.2, raise: 0.3, hold: 4.0, fall: 0.5,
           lean0: 0, swayHz: 0.7, swayAmp: 0.4, rhyHz: 1.3, rhyAmp: 0.6, rhyDy: 0.4 },
    // 害羞：四帧序列（预备→瞪眼捂嘴→捂脸扭头→微笑恢复）1.5fps 扭捏循环
    shy: { wind: 0.25, raise: 0.35, hold: 4.5, fall: 0.55,
           lean0: 0.5, swayHz: 0.5, swayAmp: 0.5, rhyHz: 0.8, rhyAmp: 0.5, rhyDy: 0.3 },
  },
  starters: {},    // { 动作id: (api) => {...} } 特殊动作
  preview: 'auto', // 按 pet.json actions 自动编排截图 + GIF
});
