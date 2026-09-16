// 洁尔佩塔桌宠 - 主进程：透明置顶窗口 / 托盘 / 鼠标穿透 / 位置记忆 / 全局 Q 热键
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, globalShortcut, protocol, net } = require('electron');

const path = require('path');
const fs = require('fs');

const SIZE = { 1: 256, 2: 512 };
const PREVIEW = process.argv.includes('--preview');
const LIVE2D = process.argv.includes('--live2d'); // Live2D 渲染模式(cfg.renderer 偏好在 createWindow 时再读)
function winSize() {
  const live2d = LIVE2D || cfg.renderer === 'live2d';
  return live2d ? 512 : (SIZE[cfg.zoom] || 256);
}

let win = null;
let tray = null;
let cfg = { zoom: 1, onTop: true, qKey: true, x: null, y: null };

const cfgFile = () => path.join(app.getPath('userData'), 'pet-config.json');
function loadCfg() {
  try {
    const d = JSON.parse(fs.readFileSync(cfgFile(), 'utf8'));
    if (d && typeof d === 'object') Object.assign(cfg, d);
  } catch (e) { /* 首次运行无配置 */ }
}
function saveCfg() {
  try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg)); } catch (e) { /* 忽略写入失败 */ }
}

// ---------- 托盘图标：程序内像素画一只小狐狸头（32x32 BGRA） ----------
function trayIcon() {
  const W = 32, H = 32;
  const buf = Buffer.alloc(W * H * 4, 0);
  const set = (x, y, c, a = 255) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    buf[i] = c[2]; buf[i + 1] = c[1]; buf[i + 2] = c[0]; buf[i + 3] = a;
  };
  const disc = (cx, cy, r, c) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r) set(x, y, c);
      }
  };
  const BROWN = [122, 88, 132], DARK = [70, 50, 88], WHITE = [240, 240, 246], RED = [64, 82, 226];
  // 耳朵（深色描边三角 + 棕色内芯）
  const tri = (cx, top, bw, c) => {
    for (let i = 0; i <= 9; i++) {
      const y = top + i, hw = Math.max(0, Math.round((i / 9) * bw));
      for (let x = cx - hw; x <= cx + hw; x++) set(x, y, c);
    }
  };
  tri(9, 3, 5, DARK); tri(23, 3, 5, DARK);
  tri(9, 4, 3.4, BROWN); tri(23, 4, 3.4, BROWN);
  disc(16, 20, 12, DARK);   // 头轮廓
  disc(16, 20, 10.4, BROWN); // 头
  disc(16, 25, 6, WHITE);   // 白色口鼻
  disc(11.5, 18.6, 2.1, RED); disc(20.5, 18.6, 2.1, RED); // 红瞳
  disc(16, 23.4, 1.5, DARK); // 鼻子
  return nativeImage.createFromBitmap(buf, { width: W, height: H });
}

// ---------- 窗口 ----------
// Windows 非 100% 显示缩放下，Electron 移动窗口时宽高会因 DIP 取整误差漂移。
// 双保险：1) 最小/最大尺寸锁死为期望值；2) 每次移动后检测尺寸，偏了立即写回。
function lockSize() {
  if (!win) return;
  const s = winSize();
  win.setMinimumSize(s, s);
  win.setMaximumSize(s, s);
}

function createWindow() {
  const s = winSize();
  const wa = screen.getPrimaryDisplay().workArea;
  let x = cfg.x, y = cfg.y;
  if (x == null || y == null) {
    x = wa.x + wa.width - s - 28;
    y = wa.y + wa.height - s - 28;
  }
  // 保证至少大部分可见
  const d = screen.getDisplayNearestPoint({ x: x + s / 2, y: y + s / 2 }) || screen.getPrimaryDisplay();
  const dwa = d.workArea;
  x = Math.max(dwa.x - s + 80, Math.min(x, dwa.x + dwa.width - 80));
  y = Math.max(dwa.y - s + 80, Math.min(y, dwa.y + dwa.height - 80));

  win = new BrowserWindow({
    x, y, width: s, height: s,
    transparent: true, frame: false, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(!!cfg.onTop, 'screen-saver');
  lockSize();
  win.loadFile(
    path.join(__dirname, 'src', LIVE2D ? 'live2d.html' : 'index.html'),
    PREVIEW ? { query: { preview: '1' } } : undefined,
  );
  win.once('ready-to-show', () => {
    win.show();
    win.setIgnoreMouseEvents(true, { forward: true }); // 初始穿透，命中角色后收回
  });
  win.webContents.on('render-process-gone', (e, details) => {
    console.error('[render-gone]', details.reason, details.exitCode);
  });
  win.webContents.on('unresponsive', () => console.error('[renderer unresponsive]'));
  win.on('closed', () => { win = null; });
}

// ---------- 全局 Q 热键 ----------
// 桌宠窗口透明穿透、永远没有键盘焦点，动作触发键必须在主进程用全局热键捕获。
// 注意：裸字母 Q 是系统级热键，桌宠运行期间在任何应用里按 Q 都会被拦截转发给桌宠。
function registerHotkey() {
  globalShortcut.unregister('Q');
  if (PREVIEW || !cfg.qKey || !win) return;
  const ok = globalShortcut.register('Q', () => {
    if (win) win.webContents.send('pet:hotkey', 'q');
  });
  if (!ok) console.warn('全局热键 Q 注册失败（可能被其他应用占用）');
}

// ---------- 托盘 ----------
function createTray() {
  if (PREVIEW) return;
  tray = new Tray(trayIcon());
  tray.setToolTip('洁尔佩塔 · 桌面宠物');
  tray.setContextMenu(buildMenu());
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: '缩放：标准 256×256', type: 'radio', checked: cfg.zoom === 1, click: () => setZoom(1) },
    { label: '缩放：大 512×512', type: 'radio', checked: cfg.zoom === 2, click: () => setZoom(2) },
    { type: 'separator' },
    {
      label: '窗口置顶', type: 'checkbox', checked: !!cfg.onTop,
      click: (mi) => { cfg.onTop = mi.checked; if (win) win.setAlwaysOnTop(!!cfg.onTop, 'screen-saver'); saveCfg(); },
    },
    {
      label: '键盘 Q 切换表情（全局）', type: 'checkbox', checked: cfg.qKey !== false,
      click: (mi) => { cfg.qKey = mi.checked; saveCfg(); registerHotkey(); },
    },
    { type: 'separator' },
    { label: '退出', click: () => { saveCfg(); app.quit(); } },
  ]);
}

function setZoom(z) {
  if (!win || z === cfg.zoom) return;
  const b = win.getBounds();
  const cx = b.x + b.width / 2, bot = b.y + b.height; // 保持底部中心锚点
  const s = SIZE[z];
  win.setBounds({ x: Math.round(cx - s / 2), y: Math.round(bot - s), width: s, height: s });
  cfg.zoom = z;
  lockSize();
  saveCfg();
  if (tray) tray.setContextMenu(buildMenu()); // 只刷新菜单，不重建托盘（否则图标会重复）
}

// ---------- IPC ----------
ipcMain.handle('pet:init', () => ({ preview: PREVIEW }));
ipcMain.on('pet:ignore', (e, v) => { if (win) win.setIgnoreMouseEvents(!!v, { forward: true }); });
ipcMain.on('pet:moveBy', (e, dx, dy) => {
  if (!win) return;
  const s = SIZE[cfg.zoom] || 256;
  const [x, y] = win.getPosition();
  const nx = x + Math.round(dx), ny = y + Math.round(dy);
  win.setPosition(nx, ny);
  const b = win.getBounds();
  if (b.width !== s || b.height !== s) {
    win.setBounds({ x: nx, y: ny, width: s, height: s }); // 漂移立即写回，不累积
  }
  cfg.x = nx; cfg.y = ny;
});
ipcMain.handle('pet:capture', async (e, name) => {
  if (!win) return null;
  const img = await win.webContents.capturePage();
  const dir = path.join(__dirname, 'preview');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name + '.png');
  fs.writeFileSync(f, img.toPNG());
  return f;
});
ipcMain.on('pet:done', () => { saveCfg(); app.quit(); });

// ---------- app:// 协议: 让渲染进程能用 XHR 加载本地模型资源(file:// 会被 CORS 拦截) ----------
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// ---------- 生命周期 ----------
app.whenReady().then(() => {
  const MIME = { '.json': 'application/json', '.png': 'image/png', '.moc3': 'application/octet-stream', '.webp': 'image/webp' };
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    if (u.host !== 'live2d') return new Response('not found', { status: 404 });
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const file = path.join(__dirname, 'assets', 'live2d', rel);
    try {
      const data = fs.readFileSync(file);
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return new Response(data, { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': type } });
    } catch (err) {
      console.error('[app-protocol] miss:', file, err.message);
      return new Response('not found', { status: 404 });
    }
  });
  loadCfg();
  app.setAppUserModelId('com.endfield.gilberta.pet');
  createWindow();
  createTray();
  registerHotkey();
  setInterval(saveCfg, 5000); // 周期性保存位置
  if (process.env.PET_SMOKE) setTimeout(() => app.quit(), 6000); // 冒烟测试：自动退出
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { saveCfg(); app.quit(); });
