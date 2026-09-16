// 预加载：向渲染进程暴露最小 IPC 接口
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  init: () => ipcRenderer.invoke('pet:init'),
  ignore: (v) => ipcRenderer.send('pet:ignore', v),
  moveBy: (dx, dy) => ipcRenderer.send('pet:moveBy', dx, dy),
  capture: (name) => ipcRenderer.invoke('pet:capture', name),
  done: () => ipcRenderer.send('pet:done'),
  onAction: (cb) => ipcRenderer.on('pet:hotkey', () => cb()),
});
