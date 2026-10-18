import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
const createLifecycle = require('./lifecycle.cjs');
function fixture(platform = 'win32', primary = true) {
  const app = Object.assign(new EventEmitter(), { quits: 0, requestSingleInstanceLock: () => primary, quit() { this.quits++; } });
  const powerMonitor = new EventEmitter();
  let tray: any;
  let created = 0;
  const windows: any[] = [];
  const image = { template: false, isEmpty: () => false, setTemplateImage(value: boolean) { this.template = value; } };
  const lifecycle = createLifecycle({ app, powerMonitor, platform, assets: (name: string) => name,
    nativeImage: { createFromPath: () => image }, Menu: { buildFromTemplate: (items: any) => items },
    Tray: class extends EventEmitter { menu: any; destroyed = false; constructor() { super(); tray = this; } setToolTip() {} setContextMenu(menu: any) { this.menu = menu; } destroy() { this.destroyed = true; } },
    getWindows: () => windows, createWindow: () => { created++; } });
  function window() {
    const w = Object.assign(new EventEmitter(), { webContents: new EventEmitter(), visible: true, minimized: false, destroyed: false, focused: false,
      isDestroyed() { return this.destroyed; }, isVisible() { return this.visible; }, isMinimized() { return this.minimized; },
      restore() { this.minimized = false; }, show() { this.visible = true; }, hide() { this.visible = false; }, focus() { this.focused = true; } });
    windows.push(w); lifecycle.attach(w); return w;
  }
  function close(w: any) { let prevented = false; w.emit('close', { preventDefault() { prevented = true; } }); return prevented; }
  return { app, powerMonitor, lifecycle, window, close, image, get tray() { return tray; }, get created() { return created; } };
}
describe('desktop lifecycle', () => {
  test('close hides instead of quitting; tray click restores minimized window', () => {
    const f = fixture(); f.lifecycle.start(); const w = f.window();
    expect(f.close(w)).toBe(true); expect(w.visible).toBe(false); expect(f.app.quits).toBe(0);
    w.minimized = true; f.tray.emit('click');
    expect(w.visible && w.focused).toBe(true); expect(w.minimized).toBe(false);
  });
  test('menu show, second launch and dock activation restore hidden windows', () => {
    const f = fixture(); f.lifecycle.start(); const w = f.window();
    for (const restore of [() => f.tray.menu[0].click(), () => f.app.emit('second-instance'), () => f.app.emit('activate'), () => f.tray.emit('double-click')]) {
      w.hide(); restore(); expect(w.visible && w.focused).toBe(true);
    }
  });
  test('explicit tray exit and Cmd+Q do not cancel close', () => {
    for (const viaTray of [true, false]) {
      const f = fixture(); f.lifecycle.start(); const w = f.window();
      if (viaTray) { f.tray.menu[2].click(); expect(f.app.quits).toBe(1); } else f.app.emit('before-quit');
      expect(f.close(w)).toBe(false); f.app.emit('will-quit'); expect(f.tray.destroyed).toBe(true);
    }
  });
  test('Windows session end and macOS shutdown do not cancel close', () => {
    for (const event of ['query-session-end', 'session-end', 'shutdown']) {
      const f = fixture(); f.lifecycle.start(); const w = f.window();
      (event === 'shutdown' ? f.powerMonitor : w).emit(event);
      expect(f.close(w)).toBe(false);
    }
  });
  test('remote beforeunload cannot veto explicit exit or shutdown', () => {
    for (const shutdown of [true, false]) {
      const f = fixture(); f.lifecycle.start(); const w = f.window();
      let overridden = false;
      const event = { preventDefault() { overridden = true; } };
      w.webContents.emit('will-prevent-unload', event); expect(overridden).toBe(false);
      if (shutdown) f.powerMonitor.emit('shutdown'); else f.lifecycle.quit();
      w.webContents.emit('will-prevent-unload', event); expect(overridden).toBe(true);
    }
  });
  test('secondary instance exits without starting a tray', () => {
    const f = fixture('win32', false); expect(f.lifecycle.primary).toBe(false); expect(f.app.quits).toBe(1); expect(f.tray).toBeUndefined();
  });
  test('early second launch waits until ready; destroyed windows are recreated', () => {
    const f = fixture(); f.app.emit('second-instance'); expect(f.created).toBe(0);
    f.lifecycle.start(); expect(f.created).toBe(1);
    const w = f.window(); w.destroyed = true; f.lifecycle.show(); expect(f.created).toBe(2);
  });
  test('no windows remains resident with tray; without tray close is not intercepted', () => {
    const f = fixture(); const w = f.window(); expect(f.close(w)).toBe(false);
    f.lifecycle.start(); f.app.emit('window-all-closed'); expect(f.app.quits).toBe(0);
  });
  test('macOS tray uses template artwork and visible setup wins over hidden remote', () => {
    const f = fixture('darwin'); f.lifecycle.start(); expect(f.image.template).toBe(true);
    const hidden = f.window(); hidden.hide(); const setup = f.window(); f.lifecycle.show();
    expect(setup.focused).toBe(true); expect(hidden.visible).toBe(false);
  });
});
