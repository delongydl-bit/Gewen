const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const { animationShortcuts } = require('./shortcuts');

let win;
let tray;
let mouseTimer;
let selectedModel = 0;
let dragState;
let mouseInteractive = true;
let controlsVisible = false;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  const windowWidth = 620;
  const windowHeight = 700;
  win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    thickFrame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    minWidth: windowWidth,
    minHeight: windowHeight,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const area = screen.getPrimaryDisplay().workArea;
  win.setPosition(area.x + area.width - windowWidth - 24, area.y + area.height - windowHeight - 24);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('console-message', (_event, level, message) => console.log(`[renderer:${level}] ${message}`));
  win.webContents.on('render-process-gone', (_event, details) => console.error('Renderer process exited:', details));
  win.on('close', event => {
    if (!app.isQuitting) { event.preventDefault(); win.hide(); }
  });
}

function playAnimation(item) {
  send('play-animation', { name: item.animation, loop: Boolean(item.loop), label: item.label });
}

function selectModel(index) {
  selectedModel = index;
  send('select-model', index);
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示桌宠', click: () => win.show() },
    { label: '隐藏桌宠', click: () => win.hide() },
    {
      label: '模型外观',
      submenu: [0, 1, 2, 3].map(index => ({
        label: `Gewen 外观 ${index + 1}`,
        type: 'radio',
        checked: selectedModel === index,
        click: () => selectModel(index)
      }))
    },
    { label: '动作', submenu: animationShortcuts.map(item => ({ label: `${item.label}  ${item.accelerator.replace('CommandOrControl', 'Ctrl')}`, click: () => playAnimation(item) })) },
    { type: 'separator' },
    { label: '显示/隐藏控制菜单  Ctrl+Alt+M', click: () => send('toggle-ui') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]));
}

function registerShortcuts() {
  for (const item of animationShortcuts) {
    const ok = globalShortcut.register(item.accelerator, () => playAnimation(item));
    if (!ok) console.warn(`Shortcut unavailable: ${item.accelerator}`);
  }
  globalShortcut.register('CommandOrControl+Alt+M', () => send('toggle-ui'));
}

app.whenReady().then(() => {
  createWindow();
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.svg'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Gewen · Ctrl+Alt+数字键控制动作');
  tray.on('double-click', () => win.isVisible() ? win.hide() : win.show());
  rebuildTrayMenu();
  registerShortcuts();
  mouseTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    const localX = cursor.x - bounds.x;
    const localY = cursor.y - bounds.y;
    send('cursor', { x: localX, y: localY, width: bounds.width, height: bounds.height });
    // A stable padded region surrounds every authored pose. Unlike WebGL alpha
    // readback, this continues working while the native window is click-through.
    const overCharacter = localX >= 105 && localX <= bounds.width - 105 && localY >= 70 && localY <= bounds.height - 35;
    const interactive = controlsVisible || overCharacter || Boolean(dragState);
    if (interactive !== mouseInteractive) {
      mouseInteractive = interactive;
      win.setIgnoreMouseEvents(!interactive, { forward: true });
    }
  }, 40);
});

ipcMain.on('show-menu', () => tray?.popUpContextMenu());
ipcMain.on('play-animation', (_event, name) => {
  const item = animationShortcuts.find(entry => entry.animation === name);
  if (item) playAnimation(item);
});
ipcMain.on('select-model', (_event, index) => selectModel(Math.max(0, Math.min(3, Number(index) || 0))));
ipcMain.on('ui-state', (_event, visible) => { controlsVisible = Boolean(visible); });
ipcMain.on('drag-start', (_event, point) => {
  if (!win || win.isDestroyed()) return;
  const [windowX, windowY] = win.getPosition();
  dragState = { pointerX: Number(point.x), pointerY: Number(point.y), windowX, windowY };
});
ipcMain.on('drag-move', (_event, point) => {
  if (!dragState || !win || win.isDestroyed()) return;
  const x = Math.round(dragState.windowX + Number(point.x) - dragState.pointerX);
  const y = Math.round(dragState.windowY + Number(point.y) - dragState.pointerY);
  win.setPosition(x, y, false);
});
ipcMain.on('drag-end', () => { dragState = undefined; });

app.on('before-quit', () => {
  app.isQuitting = true;
  clearInterval(mouseTimer);
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', event => event.preventDefault());
