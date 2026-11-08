import { useEffect, useRef, useState } from 'react';
import type { Terminal, ITheme } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './canvas-terminal-font.css';

/** Letters come from the system monospace font; prompt icons (powerlevel10k, Nerd Font private-use glyphs)
 * fall through to the bundled symbols-only Nerd Font, which loads only when such a glyph appears. */
export const terminalFont = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Symbols Nerd Font Mono", monospace';

type Status = { kind: 'connecting' } | { kind: 'ready'; cwd: string } | { kind: 'closed'; message: string };
type Props = { agentId: string; theme: 'light' | 'dark'; active: boolean };

/** Colours follow the UI tokens: Canvas surface background, primary ink, accent cursor. */
export const terminalThemes: Record<'light' | 'dark', ITheme> = {
  light: { background: '#ffffff', foreground: '#161616', cursor: '#161616', cursorAccent: '#ffffff', selectionBackground: 'rgba(6,6,6,.14)',
    black: '#161616', red: '#c4232b', green: '#26713d', yellow: '#8a5a00', blue: '#1f5fbf', magenta: '#8a3fb8', cyan: '#0f7480', white: '#70686a',
    brightBlack: '#70686a', brightRed: '#e0353d', brightGreen: '#2f8a4b', brightYellow: '#a26c00', brightBlue: '#2f74d9', brightMagenta: '#a14fd1', brightCyan: '#168896', brightWhite: '#9b9395' },
  dark: { background: '#212121', foreground: '#fdfdfd', cursor: '#fdfdfd', cursorAccent: '#212121', selectionBackground: 'rgba(255,255,255,.18)',
    black: '#3a3a3a', red: '#ff6b6b', green: '#6bd28b', yellow: '#e8c06a', blue: '#7aa7ff', magenta: '#d39bff', cyan: '#6fd3df', white: '#beb6b8',
    brightBlack: '#70686a', brightRed: '#ff8787', brightGreen: '#8ee3a6', brightYellow: '#f2d48a', brightBlue: '#9cbfff', brightMagenta: '#e2b8ff', brightCyan: '#93e3ec', brightWhite: '#fdfdfd' },
};

const socketUrl = (agentId: string, cols: number, rows: number) => {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/ui-lab/terminal?agentId=${encodeURIComponent(agentId)}&cols=${cols}&rows=${rows}`;
};
const closeMessage = (code: number, reason: string) => {
  if (code === 1000 || code === 1001) return reason === 'Idle timeout' ? 'Сессия закрыта по неактивности' : 'Терминал закрыт';
  if (code === 1009) return 'Слишком большое сообщение';
  if (code === 1013) return 'Терминал не успевал отдавать вывод';
  return reason || 'Не удалось подключиться к терминалу (возможно, превышен лимит сессий или папка недоступна)';
};

/** An interactive shell in the agent's local workspace, over the owner-only /ui-lab/terminal socket.
 * The xterm instance and its socket live while the tab exists; hiding the tab keeps the shell running. */
export function CanvasTerminal({ agentId, theme, active }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const themeRef = useRef(theme);
  const [status, setStatus] = useState<Status>({ kind: 'connecting' });
  const [session, setSession] = useState(0);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    setStatus({ kind: 'connecting' });
    void Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]).then(([{ Terminal }, { FitAddon }]) => {
      if (disposed || !host.current) return;
      const terminal = new Terminal({ cursorBlink: true, fontSize: 13, lineHeight: 1.2, scrollback: 5000, allowProposedApi: false,
        fontFamily: terminalFont, theme: terminalThemes[themeRef.current] });
      const fitter = new FitAddon();
      terminal.loadAddon(fitter);
      terminal.open(host.current);
      term.current = terminal; fit.current = fitter;
      try { fitter.fit(); } catch { /* hidden tab: fitted when shown */ }
      const ws = new WebSocket(socketUrl(agentId, Math.max(2, terminal.cols), Math.max(2, terminal.rows)), ['hyper-terminal']);
      ws.binaryType = 'arraybuffer';
      socket.current = ws;
      const send = (message: object) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
      let exited: number | null = null;
      ws.onmessage = event => {
        if (typeof event.data !== 'string') { terminal.write(new Uint8Array(event.data as ArrayBuffer)); return; }
        try {
          const message = JSON.parse(event.data) as { type?: string; cwd?: string; code?: number };
          if (message.type === 'ready') { setStatus({ kind: 'ready', cwd: String(message.cwd ?? '') }); send({ type: 'resize', cols: terminal.cols, rows: terminal.rows }); }
          if (message.type === 'exit') exited = Number(message.code ?? 0);
        } catch { /* only JSON control frames are text */ }
      };
      ws.onclose = event => {
        if (disposed) return;
        setStatus({ kind: 'closed', message: exited !== null ? `Процесс завершён (код ${exited})` : closeMessage(event.code, event.reason) });
      };
      terminal.onData(data => send({ type: 'input', data }));
      terminal.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }));
      observer = new ResizeObserver(() => {
        if (!host.current || host.current.clientWidth === 0 || host.current.clientHeight === 0) return;
        try { fitter.fit(); } catch { /* not measurable yet */ }
      });
      observer.observe(host.current);
    }).catch(() => { if (!disposed) setStatus({ kind: 'closed', message: 'Не удалось загрузить терминал' }); });
    return () => {
      disposed = true;
      observer?.disconnect();
      socket.current?.close(); socket.current = null;
      term.current?.dispose(); term.current = null; fit.current = null;
    };
  }, [agentId, session]);

  useEffect(() => { themeRef.current = theme; if (term.current) term.current.options.theme = terminalThemes[theme]; }, [theme]);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => { try { fit.current?.fit(); } catch { /* not measurable */ } term.current?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [active, status.kind]);

  return <div className="canvas-terminal" role="tabpanel" aria-label="Terminal" hidden={!active} data-theme={theme}>
    <div ref={host} className="canvas-terminal-screen" />
    {status.kind === 'connecting' && <div className="canvas-terminal-status" role="status">Запускаем терминал…</div>}
    {status.kind === 'closed' && <div className="canvas-terminal-status canvas-terminal-closed" role="alert">
      <span>{status.message}</span>
      <button type="button" onClick={() => setSession(n => n + 1)}>Перезапустить</button>
    </div>}
  </div>;
}
