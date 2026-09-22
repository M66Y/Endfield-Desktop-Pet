// 多桌宠主进程：PetManager（每宠独立窗口/配置/日志） / 单实例 + second-instance 唤出
// / 全局热键唯一注册（Q + Alt+数字）按 activePet 路由 / 托盘 / 鼠标穿透 / 位置记忆
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, globalShortcut, protocol } = require('electron');

const path = require('path');
const fs = require('fs');

const SIZE = { 1: 256, 2: 512 };
const PREVIEW = process.argv.includes('--preview');
const LIVE2D = process.argv.includes('--live2d'); // Live2D 渲染模式(仅洁尔佩塔, cfg.renderer 偏好在建窗时再读)
const DEFAULT_PET = (() => {
  // 分宠打包：每个 exe 的 package.json 里注入自己的 petId（extraMetadata），双击即启动对应桌宠
  try { return require('./package.json').petId || 'jielpeita'; } catch (e) { return 'jielpeita'; }
})();

function petArg(argv) {
  for (const a of argv) if (a.startsWith('--pet=')) return a.slice(6);
  return null;
}

// ---------- 桌宠注册表：扫描 src/pets/*/pet.json ----------
function loadPetDefs() {
  const defs = {};
  const dir = path.join(__dirname, 'src', 'pets');
  for (const id of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const f = path.join(dir, id, 'pet.json');
    if (!fs.existsSync(f)) continue;
    try { defs[id] = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error('[pet-def]', id, e.message); }
  }
  return defs;
}
const PET_DEFS = loadPetDefs();

// ---------- 日志：userData/logs/<petId>.log + main.log ----------
const logDir = () => path.join(app.getPath('userData'), 'logs');
function appendLog(file, level, args) {
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    const line = `[${new Date().toISOString()}] [${level}] ${args.map((a) => String(a)).join(' ')}\n`;
    fs.appendFileSync(path.join(logDir(), file), line);
  } catch (e) { /* 日志失败不影响运行 */ }
}
const mainLog = (...a) => { console.log('[main]', ...a); appendLog('main.log', 'info', a); };
const mainWarn = (...a) => { console.warn('[main]', ...a); appendLog('main.log', 'warn', a); };

// ---------- 配置：全局热键开关 + 每宠独立配置文件 ----------
const gCfg = { qKey: true, digitKeys: true }; // Q 切换 / Alt+数字直选（全局，托盘可开关）
const gCfgFile = () => path.join(app.getPath('userData'), 'global-config.json');
function loadG() {
  try {
    const d = JSON.parse(fs.readFileSync(gCfgFile(), 'utf8'));
    if (d && typeof d === 'object') Object.assign(gCfg, d);
  } catch (e) { /* 首次运行 */ }
}
function saveG() { try { fs.writeFileSync(gCfgFile(), JSON.stringify(gCfg)); } catch (e) { /* 忽略 */ } }

function petCfgFile(id) { return path.join(app.getPath('userData'), 'pets', id, 'config.json'); }
function loadPetCfg(id) {
  const cfg = { zoom: (PET_DEFS[id] && PET_DEFS[id].defaultZoom) || 1, onTop: true, x: null, y: null };
  try {
    const d = JSON.parse(fs.readFileSync(petCfgFile(id), 'utf8'));
    if (d && typeof d === 'object') Object.assign(cfg, d);
  } catch (e) { /* 首次运行 */ }
  return cfg;
}
function savePetCfg(id) {
  const p = pets.get(id);
  if (!p) return;
  try { fs.writeFileSync(petCfgFile(id), JSON.stringify(p.cfg)); } catch (e) { /* 忽略 */ }
}
function saveAll() { for (const id of pets.keys()) savePetCfg(id); saveG(); }

// 旧版单宠配置迁移: pet-config.json -> pets/jielpeita/config.json + global-config.json
function migrateLegacyCfg() {
  const old = path.join(app.getPath('userData'), 'pet-config.json');
  if (!fs.existsSync(old)) return;
  try {
    const d = JSON.parse(fs.readFileSync(old, 'utf8'));
    if (d && typeof d === 'object') {
      const jc = petCfgFile('jielpeita');
      if (!fs.existsSync(jc)) {
        fs.mkdirSync(path.dirname(jc), { recursive: true });
        fs.writeFileSync(jc, JSON.stringify({ zoom: d.zoom ?? 1, onTop: d.onTop ?? true, x: d.x ?? null, y: d.y ?? null, ...(d.renderer ? { renderer: d.renderer } : {}) }));
        mainLog('legacy config migrated -> pets/jielpeita/config.json');
      }
      if (d.qKey !== undefined) gCfg.qKey = !!d.qKey;
      saveG();
    }
    fs.renameSync(old, old + '.bak');
  } catch (e) { mainWarn('legacy config migrate failed:', e.message); }
}

// ---------- 托盘图标 ----------
function trayIcon() {
  // 优先用应用图标（build/icon.png，随包分发）；不可用时回退程序内像素画狐狸头
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
    if (!img.isEmpty()) return img;
  } catch (e) { /* fallthrough */ }
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
  const tri = (cx, top, bw, c) => {
    for (let i = 0; i <= 9; i++) {
      const y = top + i, hw = Math.max(0, Math.round((i / 9) * bw));
      for (let x = cx - hw; x <= cx + hw; x++) set(x, y, c);
    }
  };
  tri(9, 3, 5, DARK); tri(23, 3, 5, DARK);
  tri(9, 4, 3.4, BROWN); tri(23, 4, 3.4, BROWN);
  disc(16, 20, 12, DARK);
  disc(16, 20, 10.4, BROWN);
  disc(16, 25, 6, WHITE);
  disc(11.5, 18.6, 2.1, RED); disc(20.5, 18.6, 2.1, RED);
  disc(16, 23.4, 1.5, DARK);
  return nativeImage.createFromBitmap(buf, { width: W, height: H });
}

// ---------- PetManager：每宠一个独立 BrowserWindow（独立渲染进程，天然状态隔离） ----------
const pets = new Map(); // petId -> { win, cfg, def }
let activePetId = null; // 键盘热键路由目标（悬停/点击选中者）
let tray = null;

function winSize(p) {
  const live2d = p.def.id === 'jielpeita' && (LIVE2D || p.cfg.renderer === 'live2d');
  return live2d ? 512 : (SIZE[p.cfg.zoom] || 256);
}

// Windows 非 100% 显示缩放下，Electron 移动窗口时宽高会因 DIP 取整误差漂移。
// 双保险：1) 最小/最大尺寸锁死为期望值；2) 每次移动后检测尺寸，偏了立即写回。
function lockSize(id) {
  const p = pets.get(id);
  if (!p) return;
  const s = winSize(p);
  p.win.setMinimumSize(s, s);
  p.win.setMaximumSize(s, s);
}

function createPet(id) {
  const def = PET_DEFS[id];
  if (!def) { mainWarn('unknown pet:', id); return null; }
  if (pets.has(id)) { showPet(id); return pets.get(id); }

  const cfg = loadPetCfg(id);
  const p = { win: null, cfg, def };
  pets.set(id, p);

  const s = winSize(p);
  const wa = screen.getPrimaryDisplay().workArea;
  let x = cfg.x, y = cfg.y;
  if (x == null || y == null) {
    x = wa.x + wa.width - s - 28;
    y = wa.y + wa.height - s - 28;
    const n = [...pets.values()].filter((q) => q !== p).length; // 多宠首启位置错开，避免完全重叠
    x -= 110 * (n % 3); y -= 70 * (n % 3);
  }
  // 保证至少大部分可见
  const d = screen.getDisplayNearestPoint({ x: x + s / 2, y: y + s / 2 }) || screen.getPrimaryDisplay();
  const dwa = d.workArea;
  x = Math.max(dwa.x - s + 80, Math.min(x, dwa.x + dwa.width - 80));
  y = Math.max(dwa.y - s + 80, Math.min(y, dwa.y + dwa.height - 80));

  const live2d = def.id === 'jielpeita' && (LIVE2D || cfg.renderer === 'live2d');
  const win = new BrowserWindow({
    x, y, width: s, height: s,
    transparent: true, frame: false, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  p.win = win;
  win.setAlwaysOnTop(!!cfg.onTop, 'screen-saver');
  lockSize(id);
  const query = { pet: id };
  if (PREVIEW) query.preview = '1';
  win.loadFile(path.join(__dirname, 'src', live2d ? 'live2d.html' : 'index.html'), { query });
  win.once('ready-to-show', () => {
    win.show();
    win.setIgnoreMouseEvents(true, { forward: true }); // 初始穿透，命中角色后收回
  });
  win.webContents.on('console-message', (_e, _level, message, _line, sourceId) => {
    appendLog(`${id}.log`, 'console', [message, sourceId || '']);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    mainLog(`[render-gone] ${id}:`, details.reason, details.exitCode);
    appendLog(`${id}.log`, 'error', ['render-process-gone', details.reason, details.exitCode]);
  });
  win.webContents.on('unresponsive', () => mainWarn(`[renderer unresponsive] ${id}`));
  win.on('closed', () => {
    pets.delete(id);
    if (activePetId === id) activePetId = [...pets.keys()][0] || null;
    rebuildMenu();
    registerHotkeys();
  });
  if (!activePetId) activePetId = id;
  rebuildMenu();
  registerHotkeys();
  mainLog(`pet created: ${id} (${def.name})`);
  return p;
}

function showPet(id) {
  const p = pets.get(id);
  if (!p) return createPet(id);
  if (p.win.isMinimized()) p.win.restore();
  p.win.show();
  p.win.focus();
  activePetId = id;
}

function destroyPet(id) {
  const p = pets.get(id);
  if (!p) return;
  savePetCfg(id);
  p.win.destroy(); // closed 回调里清注册表并刷新菜单/热键
}

// ---------- 全局热键：唯一注册，按 activePet 路由 ----------
// 桌宠窗口透明穿透、永远没有键盘焦点，动作触发键必须在主进程用全局热键捕获。
// 注意：裸字母 Q 是系统级热键，开启期间在任何应用里按 Q 都会被拦截转发给桌宠。
function routeKey(key) {
  const id = activePetId && pets.has(activePetId) ? activePetId : [...pets.keys()][0];
  const p = pets.get(id);
  if (!p || p.win.isDestroyed()) return;
  p.win.webContents.send('pet:hotkey', key);
}

function registerHotkeys() {
  globalShortcut.unregister('Q');
  for (let i = 1; i <= 9; i++) globalShortcut.unregister('Alt+' + i);
  if (PREVIEW || pets.size === 0) return;
  if (gCfg.qKey) {
    const ok = globalShortcut.register('Q', () => routeKey('q'));
    if (!ok) mainWarn('全局热键 Q 注册失败（可能被其他应用占用）');
  }
  if (gCfg.digitKeys) {
    for (let i = 1; i <= 9; i++) {
      const ok = globalShortcut.register('Alt+' + i, () => routeKey(String(i)));
      if (!ok) mainWarn(`全局热键 Alt+${i} 注册失败`);
    }
  }
}

// ---------- 托盘 ----------
function createTray() {
  if (PREVIEW) return;
  tray = new Tray(trayIcon());
  tray.setToolTip('桌面宠物 · ' + Object.values(PET_DEFS).map((d) => d.name).join(' / '));
  tray.setContextMenu(buildMenu());
}
function rebuildMenu() { if (tray) tray.setContextMenu(buildMenu()); }

function buildMenu() {
  const tmpl = [];
  for (const [id, def] of Object.entries(PET_DEFS)) {
    const p = pets.get(id);
    const sub = [
      {
        label: p && p.win.isVisible() ? '隐藏' : '显示',
        click: () => { const q = pets.get(id); if (!q) return createPet(id); q.win.isVisible() ? q.win.hide() : q.win.show(); rebuildMenu(); },
      },
    ];
    if (p) {
      sub.push(
        { label: '缩放：标准 256×256', type: 'radio', checked: p.cfg.zoom === 1, click: () => setZoom(id, 1) },
        { label: '缩放：大 512×512', type: 'radio', checked: p.cfg.zoom === 2, click: () => setZoom(id, 2) },
        {
          label: '窗口置顶', type: 'checkbox', checked: !!p.cfg.onTop,
          click: (mi) => { p.cfg.onTop = mi.checked; p.win.setAlwaysOnTop(!!p.cfg.onTop, 'screen-saver'); savePetCfg(id); },
        },
        { type: 'separator' },
        { label: '重启', click: () => { destroyPet(id); createPet(id); } },
        { label: '关闭', click: () => destroyPet(id) },
      );
    } else {
      sub.push({ label: '启动', click: () => createPet(id) });
    }
    tmpl.push({ label: def.name + (p ? '' : '（未运行）'), submenu: sub });
  }
  tmpl.push(
    { type: 'separator' },
    {
      label: '键盘 Q 切换动作（全局）', type: 'checkbox', checked: gCfg.qKey !== false,
      click: (mi) => { gCfg.qKey = mi.checked; saveG(); registerHotkeys(); },
    },
    {
      label: 'Alt+数字 直选动作（全局）', type: 'checkbox', checked: gCfg.digitKeys !== false,
      click: (mi) => { gCfg.digitKeys = mi.checked; saveG(); registerHotkeys(); },
    },
    { type: 'separator' },
    { label: '退出', click: () => { saveAll(); app.quit(); } },
  );
  return Menu.buildFromTemplate(tmpl);
}

function setZoom(id, z) {
  const p = pets.get(id);
  if (!p || z === p.cfg.zoom) return;
  const b = p.win.getBounds();
  const cx = b.x + b.width / 2, bot = b.y + b.height; // 保持底部中心锚点
  const s = SIZE[z];
  p.win.setBounds({ x: Math.round(cx - s / 2), y: Math.round(bot - s), width: s, height: s });
  p.cfg.zoom = z;
  lockSize(id);
  savePetCfg(id);
  rebuildMenu(); // 只刷新菜单，不重建托盘（否则图标会重复）
}

// ---------- IPC（petId 由主进程按 sender 反查窗口归属，客户端不传、不可伪造） ----------
function senderPet(e) { // 返回该 IPC 事件发送者所属的 petId
  for (const [id, p] of pets) if (p.win && !p.win.isDestroyed() && p.win.webContents === e.sender) return id;
  return null;
}
ipcMain.handle('pet:init', (e) => {
  const petId = senderPet(e);
  if (!petId) return null;
  const p = pets.get(petId);
  return { petId, preview: PREVIEW, def: p ? p.def : PET_DEFS[petId] };
});
ipcMain.on('pet:ignore', (e, v) => {
  const p = pets.get(senderPet(e));
  if (p) p.win.setIgnoreMouseEvents(!!v, { forward: true });
});
ipcMain.on('pet:moveBy', (e, dx, dy) => {
  const p = pets.get(senderPet(e));
  if (!p) return;
  const s = SIZE[p.cfg.zoom] || 256;
  const [x, y] = p.win.getPosition();
  const nx = x + Math.round(dx), ny = y + Math.round(dy);
  p.win.setPosition(nx, ny);
  const b = p.win.getBounds();
  if (b.width !== s || b.height !== s) {
    p.win.setBounds({ x: nx, y: ny, width: s, height: s }); // 漂移立即写回，不累积
  }
  p.cfg.x = nx; p.cfg.y = ny;
});
ipcMain.handle('pet:capture', async (e, name) => {
  const petId = senderPet(e);
  const p = pets.get(petId);
  if (!p) return null;
  const img = await p.win.webContents.capturePage();
  const dir = path.join(__dirname, 'preview', petId);
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, String(name).replace(/[\\/:*?"<>|]/g, '_') + '.png');
  fs.writeFileSync(f, img.toPNG());
  return f;
});
ipcMain.on('pet:done', (e) => {
  const petId = senderPet(e);
  if (!petId) return;
  savePetCfg(petId);
  if (PREVIEW) app.quit(); // 预览模式跑完自动退出
});
ipcMain.on('pet:hover', (e) => { const id = senderPet(e); if (id) activePetId = id; });
ipcMain.on('pet:select', (e) => { const id = senderPet(e); if (id) activePetId = id; });
ipcMain.on('pet:log', (e, level, ...msgs) => { const id = senderPet(e); if (id) appendLog(id + '.log', level || 'info', msgs); });
ipcMain.on('pet:crash', (e) => { // 验收用：模拟该宠渲染进程崩溃
  const petId = senderPet(e);
  if (!petId) return;
  mainLog('dev crash requested:', petId);
  e.sender.forcefullyCrashRenderer();
});

// ---------- app:// 协议: 让渲染进程能用 XHR 加载本地模型资源(file:// 会被 CORS 拦截) ----------
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// ---------- 生命周期 ----------
// ---------- 生命周期 ----------
// 不同桌宠的 exe 产品名不同，但必须共用同一份 userData（配置/日志/单实例锁）：
// 单实例锁基于 userData 路径，钉住它才能让"启动另一只 exe"转发给已运行实例，
// 否则两个进程各自持锁、全局热键互相抢占。
app.setPath('userData', path.join(app.getPath('appData'), 'gilberta-desktop-pet'));
const gotLock = app.requestSingleInstanceLock({ petId: DEFAULT_PET });
if (!gotLock) {
  app.quit();
} else {
  // 已有实例时再启动（例如点了另一只桌宠的 exe/bat）：同进程内唤出对应桌宠。
  // 分宠 exe 双击启动没有 --pet 参数（portable stub 也不回传自身路径），
  // 因此第二个实例通过 requestSingleInstanceLock 的 additionalData 声明自己的 petId。
  app.on('second-instance', (_e, argv, _cwd, additionalData) => {
    const id = petArg(argv) || (additionalData && additionalData.petId);
    mainLog('[second-instance] forwarded pet:', id || '(unknown)');
    if (id && PET_DEFS[id]) showPet(id);
    else { const p = pets.get(activePetId); if (p) { p.win.show(); p.win.focus(); } }
  });

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
        mainLog('[app-protocol] miss:', file, err.message);
        return new Response('not found', { status: 404 });
      }
    });
    loadG();
    migrateLegacyCfg();
    app.setAppUserModelId('com.endfield.gilberta.pet');
    const initial = petArg(process.argv) || DEFAULT_PET;
    createPet(PET_DEFS[initial] ? initial : DEFAULT_PET);
    createTray();
    registerHotkeys();
    setInterval(saveAll, 5000); // 周期性保存位置
    if (process.env.PET_SMOKE) setTimeout(() => app.quit(), 6000); // 冒烟测试：自动退出
  });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); saveAll(); });
  app.on('window-all-closed', () => { saveAll(); app.quit(); });
}
