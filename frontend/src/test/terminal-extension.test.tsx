import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const xterm = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock('../../../plugins/terminal/node_modules/@xterm/xterm', () => ({
  Terminal: class {
    cols = 80; rows = 24; options: any; written: any[] = []; data?: (d: string) => void; resized?: (s: { cols: number; rows: number }) => void; disposed = false;
    constructor(options: any) { this.options = options; xterm.instances.push(this); }
    loadAddon() {} open() {} focus() {}
    write(d: any) { this.written.push(d); }
    onData(fn: any) { this.data = fn; } onResize(fn: any) { this.resized = fn; }
    dispose() { this.disposed = true; }
  },
}));
vi.mock('../../../plugins/terminal/node_modules/@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
import { TerminalView as CanvasTerminal, terminalThemes } from '../../../plugins/terminal/ui/TerminalView';
import terminalExtension, { TerminalLauncher } from '../../../plugins/terminal/ui';
import { createExtensionRegistry } from '../extensions/registry';

class FakeSocket {
  static OPEN = 1; static all: FakeSocket[] = [];
  readyState = 1; sent: string[] = []; binaryType = ''; closed = false;
  onmessage?: (e: { data: unknown }) => void; onclose?: (e: { code: number; reason: string }) => void;
  constructor(public url: string, public protocols: string[]) { FakeSocket.all.push(this); }
  send(d: string) { this.sent.push(d); }
  close() { this.closed = true; }
}
beforeEach(() => {
  xterm.instances.length = 0; FakeSocket.all.length = 0;
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

describe('terminal plugin', () => {
  it('declares one granted Start launcher that inherits the plugin icon', () => {
    const registry = createExtensionRegistry([terminalExtension], { terminal: { canvasLaunchers: ['terminal'] } }, { terminal: 'ph-terminal-window' });
    expect(registry.canvasLaunchers).toHaveLength(1);
    expect(registry.canvasLaunchers[0]).toMatchObject({ key: 'terminal/terminal', title: 'Terminal', icon: 'ph-terminal-window' });
  });
  it('asks for a chat when there is no agent', () => {
    render(<TerminalLauncher context={{ agentId: null, theme: 'dark', readOnly: false }} tabId="page-1" active />);
    expect(screen.getByRole('alert')).toHaveTextContent('только внутри чата');
  });
});

describe('CanvasTerminal', () => {
  it('connects to the owner terminal socket with size, relays input, output, resize and theme', async () => {
    const ui = render(<CanvasTerminal agentId="a b" theme="light" active />);
    await settle();
    const ws = FakeSocket.all[0]!; const term = xterm.instances[0];
    expect(ws.url).toBe(`ws://${location.host}/terminal/socket?agentId=a%20b&cols=80&rows=24`);
    expect(ws.protocols).toEqual(['hyper-terminal']);
    expect(screen.getByRole('status')).toHaveTextContent('Запускаем терминал');
    act(() => ws.onmessage!({ data: JSON.stringify({ type: 'ready', cwd: '/w' }) }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(JSON.parse(ws.sent.at(-1)!)).toEqual({ type: 'resize', cols: 80, rows: 24 });
    ws.onmessage!({ data: new Uint8Array([104, 105]).buffer });
    expect(Array.from(term.written[0])).toEqual([104, 105]);
    term.data('ls\r');
    expect(JSON.parse(ws.sent.at(-1)!)).toEqual({ type: 'input', data: 'ls\r' });
    term.resized({ cols: 100, rows: 30 });
    expect(JSON.parse(ws.sent.at(-1)!)).toEqual({ type: 'resize', cols: 100, rows: 30 });
    expect(term.options.theme).toBe(terminalThemes.light);
    ui.rerender(<CanvasTerminal agentId="a b" theme="dark" active />);
    expect(term.options.theme).toBe(terminalThemes.dark);
    ui.unmount();
    expect(ws.closed).toBe(true);
    expect(term.disposed).toBe(true);
  });

  it('reports the shell exit and restarts a fresh session on request', async () => {
    render(<CanvasTerminal agentId="a" theme="dark" active />);
    await settle();
    const ws = FakeSocket.all[0]!;
    act(() => { ws.onmessage!({ data: JSON.stringify({ type: 'exit', code: 3 }) }); ws.onclose!({ code: 1000, reason: 'Shell exited' }); });
    expect(screen.getByRole('alert')).toHaveTextContent('Процесс завершён (код 3)');
    fireEvent.click(screen.getByRole('button', { name: 'Перезапустить' }));
    await settle();
    expect(FakeSocket.all).toHaveLength(2);
    expect(ws.closed).toBe(true);
    expect(xterm.instances[0].disposed).toBe(true);
  });

  it('explains a refused connection', async () => {
    render(<CanvasTerminal agentId="a" theme="dark" active />);
    await settle();
    act(() => FakeSocket.all[0]!.onclose!({ code: 1006, reason: '' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось подключиться');
  });
});
