// 预加载：向渲染进程暴露最小 IPC 接口。
// petId 的权威绑定在主进程（按 IPC sender 反查窗口归属），preload 不传、不可伪造；
// window.pet.petId 先取 URL ?pet= 作显示用途，init() 返回主进程确认的 petId 后覆盖。
const { contextBridge, ipcRenderer } = require('electron');

let petId = 'unknown';
try {
  const q = new URLSearchParams(location.search).get('pet');
  if (q) petId = q;
} catch (e) { /* 非 pet 页面 */ }

let initP = null;

contextBridge.exposeInMainWorld('pet', {
  get petId() { return petId; },
  init: () => {
    if (!initP) {
      initP = ipcRenderer.invoke('pet:init').then((r) => {
        if (r && r.petId) petId = r.petId;
        return r;
      });
    }
    return initP;
  },
  ignore: (v) => ipcRenderer.send('pet:ignore', v),
  moveBy: (dx, dy) => ipcRenderer.send('pet:moveBy', dx, dy),
  capture: (name) => ipcRenderer.invoke('pet:capture', name),
  done: () => ipcRenderer.send('pet:done'),
  hover: () => ipcRenderer.send('pet:hover'),   // 鼠标悬停命中角色（激活为热键路由目标）
  select: () => ipcRenderer.send('pet:select'), // 点击选中
  log: (level, ...msgs) => ipcRenderer.send('pet:log', level, ...msgs),
  crash: () => ipcRenderer.send('pet:crash'),   // 验收用：模拟渲染进程崩溃
  onAction: (cb) => ipcRenderer.on('pet:hotkey', (_e, key) => cb(key)), // key: 'q' | '1'..'9'
});
