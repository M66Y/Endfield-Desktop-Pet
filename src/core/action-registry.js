// 通用动作注册表：注册顺序即 Q 循环序 = Alt+数字直选序（数字从 1 起）
// 各桌宠在自己的 renderer 里实例化，天然按渲染进程隔离。
export class ActionRegistry {
  constructor(log = () => {}) {
    this.actions = []; // [{ id, label, start, stop? }]
    this.cursor = 0;   // 下一次 playNext 的下标
    this.currentId = null;
    this.log = log;
  }

  add(def) { this.actions.push(def); return this; }

  get length() { return this.actions.length; }

  _play(i, via) {
    const a = this.actions[i];
    if (!a) return false;
    this.currentId = a.id;
    this.log(`[action] ${via} -> #${i + 1} ${a.id}${a.label ? `(${a.label})` : ''}`);
    if (typeof a.start === 'function') a.start();
    return true;
  }

  // Q：按注册顺序循环下一个动作
  playNext() {
    if (!this.actions.length) return false;
    const ok = this._play(this.cursor, 'q');
    this.cursor = (this.cursor + 1) % this.actions.length;
    return ok;
  }

  // 数字直选：n 为 1..length；越界忽略；之后 Q 从该动作的下一个继续
  goto(n) {
    if (!Number.isInteger(n) || n < 1 || n > this.actions.length) {
      this.log(`[action] goto(${n}) 超出 1..${this.actions.length}，忽略`);
      return false;
    }
    this.cursor = n % this.actions.length;
    return this._play(n - 1, 'digit');
  }
}
