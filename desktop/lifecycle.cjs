'use strict';

// Electron is injected so lifecycle policy can be tested without a display server.
module.exports = function createLifecycle({ app, Tray, Menu, nativeImage, powerMonitor, platform, assets, getWindows, createWindow }) {
  let quitting = false;
  let tray;
  let ready = false;
  let pendingShow = false;
  const primary = app.requestSingleInstanceLock();
  function show() {
    if (quitting) return;
    if (!ready) { pendingShow = true; return; }
    const windows = getWindows().filter(window => window && !window.isDestroyed());
    const window = windows.find(window => window.isVisible()) || windows[0];
    if (!window) { createWindow(); return; }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
  function quit() { quitting = true; app.quit(); }
  if (!primary) { quit(); return { primary, attach() {}, start() {}, show, quit }; }
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { if (tray) { tray.destroy(); tray = null; } });
  app.on('second-instance', show);
  app.on('activate', show);
  app.on('window-all-closed', () => { if (quitting || !tray) app.quit(); });
  return {
    primary, show, quit,
    attach(window) {
      // Windows session shutdown does not always emit app.before-quit.
      window.webContents.on('will-prevent-unload', event => {
        // Remote pages must not veto an explicit quit or OS shutdown.
        if (quitting) event.preventDefault();
      });
      window.on('query-session-end', () => { quitting = true; });
      window.on('session-end', () => { quitting = true; });
      window.on('close', event => {
        if (!quitting && tray) { event.preventDefault(); window.hide(); }
      });
    },
    start() {
      const icon = nativeImage.createFromPath(assets(platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
      if (icon.isEmpty()) throw new Error('Tray icon could not be loaded');
      if (platform === 'darwin') icon.setTemplateImage(true);
      tray = new Tray(icon);
      tray.setToolTip('Hyper-code2');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Показать окно', click: show },
        { type: 'separator' },
        { label: 'Выйти', click: quit }
      ]));
      tray.on('click', show);
      tray.on('double-click', show);
      // macOS/Linux shutdown notification: never prevent the OS from ending the session.
      powerMonitor.on('shutdown', () => { quitting = true; });
      ready = true;
      if (pendingShow) { pendingShow = false; show(); }
    }
  };
};
