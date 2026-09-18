// 渲染进程通用运行时：初始化(petId/描述符) / 资源解析(限本宠目录) / 输入绑定(Q+Alt+数字)
// / 悬停与选中上报(热键路由) / 日志转发。各桌宠 renderer 复用，不包含任何宠物专属表现。
import { ActionRegistry } from './action-registry.js';

const HOVER_THROTTLE_MS = 120;

export const PetRuntime = {
  petId: null,
  def: null,     // pet.json 描述符（含动作链元数据）
  preview: false,
  assets: '',    // 本宠资源目录 URL 前缀（相对 src/*.html 页面）

  async init() {
    const info = window.pet.init ? await window.pet.init() : { preview: false, def: null };
    this.petId = (info && info.petId) || window.pet.petId; // 主进程确认的绑定优先
    this.def = (info && info.def) || {};
    this.preview = !!(info && info.preview);
    this.assets = `../assets/pets/${this.petId}/`;
    document.title = this.def.name || this.petId;
    return info;
  },

  // 只允许解析本宠资源目录内的相对路径，拒绝跨宠引用
  resolve(rel) {
    if (typeof rel !== 'string' || rel.split('/').includes('..')) {
      throw new Error(`invalid pet asset ref: ${rel}`);
    }
    return this.assets + rel;
  },

  log(...msgs) { try { window.pet.log('info', ...msgs); } catch (e) { /* 不可用则静默 */ } },

  makeRegistry() {
    return new ActionRegistry((m) => this.log(m));
  },

  // 主进程全局热键转发：'q' 循环下一动作；'1'..'9' 直选
  bindInput(reg) {
    if (!window.pet || !window.pet.onAction) return;
    window.pet.onAction((key) => {
      if (key === 'q') reg.playNext();
      else if (/^[1-9]$/.test(key)) reg.goto(parseInt(key, 10));
    });
  },

  // 悬停命中时由渲染器调用（内置节流）；主进程据此设置热键路由目标
  _lastHover: 0,
  reportHover() {
    const n = performance.now();
    if (n - this._lastHover < HOVER_THROTTLE_MS) return;
    this._lastHover = n;
    try { window.pet.hover(); } catch (e) { /* 静默 */ }
  },

  // 点击按下时调用（优先于悬停的选中信号）
  reportSelect() {
    try { window.pet.select(); } catch (e) { /* 静默 */ }
  },
};
