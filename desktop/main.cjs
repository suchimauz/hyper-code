'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, session, Tray, nativeImage, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { serverURL, webURL, sameOrigin } = require('./security.cjs');
const attachNavigation = require('./navigation.cjs');

app.enableSandbox();
let setupWindow;
let remoteWindow;
let savedURL = '';
let status = '';
let connecting = false;
let externalPrompt = false;
const localURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const preferences = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false };
const configPath = () => path.join(app.getPath('userData'), 'server.json');
const assets = name => path.join(__dirname, 'assets', name);
const lifecycle = require('./lifecycle.cjs')({ app, Tray, Menu, nativeImage, powerMonitor,
  platform: process.platform, assets, getWindows: () => [setupWindow, remoteWindow], createWindow: () => updateSetup(status) });

function updateSetup(message = '') {
  status = message;
  if (!setupWindow || setupWindow.isDestroyed()) {
    setupWindow = new BrowserWindow({ icon: assets('icon.png'), width: 620, height: 470, minWidth: 480, minHeight: 400, title: 'Hyper-code2 — сервер', webPreferences: { ...preferences, preload: path.join(__dirname, 'preload.cjs') } });
    lifecycle.attach(setupWindow);
    setupWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    setupWindow.webContents.on('will-navigate', event => event.preventDefault());
    setupWindow.on('closed', () => { setupWindow = null; });
    void setupWindow.loadFile(path.join(__dirname, 'index.html')).catch(error => { console.error('Cannot load setup window:', error); app.quit(); });
  } else {
    setupWindow.webContents.send('setup:state', { url: savedURL, status });
    setupWindow.show();
    setupWindow.focus();
  }
}

async function openExternal(value) {
  const url = webURL(value);
  if (!url || externalPrompt) return;
  externalPrompt = true;
  try {
    const { response } = await dialog.showMessageBox({ type: 'question', title: 'Внешняя ссылка', message: 'Открыть ссылку в системном браузере?', detail: url.href, buttons: ['Отмена', 'Открыть'], defaultId: 0, cancelId: 0, noLink: true });
    if (response === 1) await shell.openExternal(url.href);
  } catch (error) {
    updateSetup(`Не удалось открыть браузер: ${error.message}`);
  } finally { externalPrompt = false; }
}

async function connect(value) {
  if (connecting) return { ok: false, error: 'Подождите завершения подключения.' };
  connecting = true;
  try {
    const url = serverURL(value);
    const origin = new URL(url).origin;
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    const temporary = configPath() + '.tmp';
    await fs.writeFile(temporary, JSON.stringify({ url }), { mode: 0o600 });
    await fs.rename(temporary, configPath());
    savedURL = url;
    updateSetup('Подключение…');
    if (remoteWindow && !remoteWindow.isDestroyed()) remoteWindow.destroy();
    // A separate persistent Chromium profile per origin also isolates cookies across ports.
    const partition = 'persist:hyper-' + createHash('sha256').update(origin).digest('hex');
    const profile = session.fromPartition(partition);
    profile.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    profile.setPermissionCheckHandler(() => false);
    if (!profile.__hyperDownloadsBlocked) {
      profile.on('will-download', event => event.preventDefault());
      profile.__hyperDownloadsBlocked = true;
    }
    const window = new BrowserWindow({ icon: assets('icon.png'), width: 1280, height: 850, minWidth: 640, minHeight: 480, show: false, title: 'Hyper-code2', webPreferences: { ...preferences, partition } });
    lifecycle.attach(window);
    remoteWindow = window;
    let failed = false;
    let reportingPageError = false;
    const timer = setTimeout(() => navigation.failure('Сервер не ответил за 30 секунд.'), 30000);
    function fail(reason) {
      if (failed || window.isDestroyed()) return;
      failed = true;
      clearTimeout(timer);
      updateSetup(`Не удалось открыть ${origin}. ${reason} Проверьте адрес, VPN/сеть и сертификат, затем повторите подключение.`);
      window.destroy();
    }
    window.on('closed', () => { clearTimeout(timer); if (remoteWindow === window) remoteWindow = null; });
    window.webContents.setWindowOpenHandler(({ url: target }) => { void openExternal(target); return { action: 'deny' }; });
    const guardNavigation = (event, target) => {
      if (!sameOrigin(target, origin)) {
        event.preventDefault();
        void openExternal(target);
      }
    };
    window.webContents.on('will-navigate', guardNavigation);
    window.webContents.on('will-redirect', (event, target, _inPlace, isMainFrame) => { if (isMainFrame) guardNavigation(event, target); });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    const navigation = attachNavigation({ contents: window.webContents, origin, fail,
      ready() {
        clearTimeout(timer);
        if (!failed && !window.isDestroyed()) {
          window.show();
          if (setupWindow && !setupWindow.isDestroyed()) setupWindow.destroy();
        }
      },
      pageError(reason, options = {}) {
        console.warn('Desktop page error:', reason);
        // HTTP responses stay visible, including real browser login/error pages.
        if (options.http || reportingPageError || window.isDestroyed()) return;
        reportingPageError = true;
        void dialog.showMessageBox(window, { type: 'warning', title: 'Не удалось открыть страницу',
          message: reason, detail: 'Соединение с Hyper сохранено. Можно повторить загрузку или вернуться назад через меню «Вид».',
          buttons: ['Оставить страницу', 'Повторить'], defaultId: 0, cancelId: 0, noLink: true
        }).then(({ response }) => {
          if (response === 1 && !window.isDestroyed()) window.webContents.reload();
        }).catch(error => console.error('Cannot show page error:', error)).finally(() => { reportingPageError = false; });
      }
    });
    void window.loadURL(url).catch(error => navigation.failedLoad(error.errno, error.message));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally { connecting = false; }
}

function trustedSender(event) {
  return setupWindow && event.sender === setupWindow.webContents && event.senderFrame === setupWindow.webContents.mainFrame && event.senderFrame.url === localURL;
}
ipcMain.handle('setup:state', event => {
  if (!trustedSender(event)) throw new Error('Forbidden');
  return { url: savedURL, status };
});
ipcMain.handle('setup:connect', (event, value) => {
  if (!trustedSender(event)) throw new Error('Forbidden');
  return connect(value);
});

if (lifecycle.primary) app.whenReady().then(async () => {
  lifecycle.start();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Сервер', submenu: [
      { label: 'Сменить сервер…', accelerator: 'CmdOrCtrl+,', click: () => updateSetup() },
      { label: 'Повторить подключение', accelerator: 'CmdOrCtrl+R', click: async () => { if (savedURL) { const result = await connect(savedURL); if (!result.ok) updateSetup(result.error); } else updateSetup(); } },
      { type: 'separator' }, { role: 'quit', label: 'Выйти' }
    ] },
    { label: 'Правка', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Вид', submenu: [
      { label: 'Назад', accelerator: 'Alt+Left', click: () => { const history = remoteWindow?.webContents.navigationHistory; if (history?.canGoBack()) history.goBack(); } },
      { label: 'Повторить страницу', accelerator: 'CmdOrCtrl+Shift+R', click: () => { if (remoteWindow && !remoteWindow.isDestroyed()) remoteWindow.webContents.reload(); } },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }
    ] }
  ]));
  try { savedURL = serverURL(JSON.parse(await fs.readFile(configPath(), 'utf8')).url); }
  catch (error) { if (error.code !== 'ENOENT') status = 'Сохранённый адрес не удалось прочитать. Введите его заново.'; }
  updateSetup(status);
  if (savedURL) { const result = await connect(savedURL); if (!result.ok) updateSetup(result.error); }
}).catch(error => { console.error('Desktop startup failed:', error); app.quit(); });

