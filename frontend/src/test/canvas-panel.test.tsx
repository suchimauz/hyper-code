import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasPanel } from '../components/hyper/CanvasPanel';
// Vitest disables CSS processing; supply a marker to verify shell-only injection.
vi.mock('../components/hyper/CanvasTerminal', () => ({ CanvasTerminal: ({ agentId, active, theme }: { agentId: string; active: boolean; theme: string }) => <div data-testid="terminal" data-agent={agentId} data-theme={theme} hidden={!active} /> }));
vi.mock('../components/hyper/canvas-embed.css?inline', () => ({ default: ':root { --canvas-bg: white; }' }));

const props = () => ({ agentId: 'agent /?', revision: '1', theme: 'light' as const, onClose: vi.fn(), expanded: false, onExpand: vi.fn() });
function loadShell(frame: HTMLIFrameElement) {
  const doc = document.implementation.createHTMLDocument('Canvas shell');
  doc.body.innerHTML = '<main data-mobile-canvas><iframe sandbox="allow-scripts" title="Content"></iframe><textarea>unsaved</textarea></main>';
  Object.defineProperty(frame, 'contentDocument', { configurable: true, value: doc });
  const resync = vi.fn(); const setAgent = vi.fn().mockReturnValue(true);
  Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { hyperLive: { resync }, hyperCanvas: { setAgent } } });
  fireEvent.load(frame);
  return { doc, resync, setAgent };
}

describe('CanvasPanel', () => {
  it('uses the agent-bound embedded URL and leaves revisions to the frame stream without replacing the frame or shell', () => {
    const initial = props(); const ui = render(<CanvasPanel {...initial} />);
    const frame = screen.getByTitle('Canvas Hyper') as HTMLIFrameElement;
    expect(frame).toHaveAttribute('src', '/canvas/agent%20%2F%3F/mobile?embed=1');
    // The default tab is the local Start page; the shell loads behind it.
    expect(screen.getByRole('tabpanel', { name: 'Start' })).toBeInTheDocument();
    const { doc, resync } = loadShell(frame);
    const input = doc.querySelector('textarea')!; input.value = 'local draft';
    resync.mockClear();
    ui.rerender(<CanvasPanel {...initial} revision="2" />);
    expect(screen.getByTitle('Canvas Hyper')).toBe(frame);
    expect(frame.contentDocument).toBe(doc);
    expect(input.value).toBe('local draft');
    expect(frame).toHaveAttribute('src', '/canvas/agent%20%2F%3F/mobile?embed=1');
    expect(resync).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('themes only the trusted shell and does not change sandboxed content', () => {
    const initial = props(); const ui = render(<CanvasPanel {...initial} />);
    const { doc } = loadShell(screen.getByTitle('Canvas Hyper') as HTMLIFrameElement);
    const content = doc.querySelector('iframe')!;
    const original = content.outerHTML;
    expect(doc.documentElement.dataset.theme).toBe('light');
    ui.rerender(<CanvasPanel {...initial} theme="dark" />);
    expect(doc.documentElement.dataset.theme).toBe('dark');
    expect(doc.querySelectorAll('#hyper-react-canvas-style')).toHaveLength(1);
    expect(doc.getElementById('hyper-react-canvas-style')?.textContent).toContain('--canvas-bg');
    expect(content.outerHTML).toBe(original);
  });

  it('exposes a recoverable invalid-shell error and accessible window controls', () => {
    const initial = props(); const ui = render(<CanvasPanel {...initial} />);
    const frame = screen.getByTitle('Canvas Hyper');
    fireEvent.load(frame);
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить Canvas');
    expect(screen.getByRole('link', { name: 'Открыть отдельно' })).toHaveAttribute('rel', 'noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть Canvas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть Canvas' }));
    expect(initial.onClose).toHaveBeenCalledOnce(); expect(initial.onExpand).toHaveBeenCalledOnce();
    ui.rerender(<CanvasPanel {...initial} expanded />);
    expect(screen.getByRole('button', { name: 'Вернуть ширину Canvas' })).toBeInTheDocument();
  });
});

function shellWithTabs(frame: HTMLIFrameElement, tabs: { id: number; title: string; active?: boolean }[]) {
  const doc = document.implementation.createHTMLDocument('Canvas shell');
  doc.body.innerHTML = `<main data-mobile-canvas data-canvas-agent="a"><nav data-canvas-tabs>${tabs.map(t => `<div data-canvas-tab="${t.id}"${t.active ? ' aria-current="true"' : ''}><button data-canvas-select="${t.id}"><i class="ph ph-file-text"></i><span>${t.title}</span></button></div>`).join('')}</nav></main>`;
  Object.defineProperty(frame, 'contentDocument', { configurable: true, value: doc });
  Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { hyperCanvas: { setAgent: vi.fn() } } });
  fireEvent.load(frame);
  return doc;
}

describe('CanvasPanel dsh tabs', () => {
  const base = () => ({ ...props(), agentId: 'a' });
  afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('opens a Start page by default with Workspace files and Terminal entries', () => {
    render(<CanvasPanel {...base()} />);
    expect(screen.getByRole('tab', { name: 'Start' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /Workspace files/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Terminal/ })).toBeEnabled();
    expect(screen.getByTitle('Canvas Hyper')).toHaveClass('behind');
  });

  it('adds Start tabs with +, persists them per agent and closes them with an exit animation', () => {
    vi.useFakeTimers();
    const ui = render(<CanvasPanel {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Новая вкладка' }));
    let tabs = screen.getAllByRole('tab', { name: 'Start' });
    expect(tabs).toHaveLength(2);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(JSON.parse(localStorage.getItem('hyper.canvas.tabs.a')!).starts).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть Start' })[1]!);
    expect(tabs[1]!.closest('.canvas-tab-chip')).toHaveClass('closing');
    act(() => { vi.advanceTimersByTime(150); });
    tabs = screen.getAllByRole('tab', { name: 'Start' });
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    // Closing the very last tab leaves a fresh Start page.
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть Start' }));
    act(() => { vi.advanceTimersByTime(150); });
    expect(screen.getAllByRole('tab', { name: 'Start' })).toHaveLength(1);
    ui.unmount();
  });

  it('mirrors agent canvas items as tabs, selects through the server and closes them there', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ activeItemId: 4 }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    render(<CanvasPanel {...base()} />);
    shellWithTabs(screen.getByTitle('Canvas Hyper') as HTMLIFrameElement, [{ id: 3, title: 'README.md', active: true }, { id: 4, title: 'notes.md' }]);
    expect(screen.getByRole('tab', { name: 'README.md' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTitle('Canvas Hyper')).not.toHaveClass('behind');
    fireEvent.click(screen.getByRole('tab', { name: 'notes.md' }));
    expect(fetcher).toHaveBeenCalledWith('/canvas/a', expect.objectContaining({ method: 'POST', body: JSON.stringify({ activeItemId: 4 }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть notes.md' }));
    act(() => { vi.advanceTimersByTime(150); });
    expect(fetcher).toHaveBeenLastCalledWith('/canvas/a', expect.objectContaining({ body: JSON.stringify({ closeItemId: 4 }) }));
    expect(screen.queryByRole('tab', { name: 'notes.md' })).not.toBeInTheDocument();
  });

  it('Workspace files opens the workspace root through the file kind and replaces the Start page', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ activeItemId: 9 }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    render(<CanvasPanel {...base()} />);
    const frame = screen.getByTitle('Canvas Hyper') as HTMLIFrameElement;
    shellWithTabs(frame, []);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Workspace files/ })); });
    expect(fetcher).toHaveBeenCalledWith('/canvas/a', expect.objectContaining({ body: JSON.stringify({ show: { kind: 'file', args: { path: '.' } } }) }));
    expect(screen.queryByRole('tab', { name: 'Start' })).not.toBeInTheDocument();
    const doc = shellWithTabs(frame, [{ id: 9, title: 'hyper-ui', active: true }]);
    expect(doc).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'hyper-ui' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Terminal replaces the Start page with a persisted Terminal tab that keeps running while hidden', () => {
    vi.useFakeTimers();
    const ui = render(<CanvasPanel {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: /Terminal/ }));
    expect(screen.getByRole('tab', { name: 'Terminal' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Start' })).not.toBeInTheDocument();
    const terminal = screen.getByTestId('terminal');
    expect(terminal).toHaveAttribute('data-agent', 'a');
    expect(terminal).not.toHaveAttribute('hidden');
    expect(JSON.parse(localStorage.getItem('hyper.canvas.tabs.a')!)).toMatchObject({ terms: [2], selected: 'terminal-2' });
    fireEvent.click(screen.getByRole('button', { name: 'Новая вкладка' }));
    expect(screen.getByTestId('terminal')).toBe(terminal);
    expect(terminal).toHaveAttribute('hidden');
    ui.unmount();
    // Reopening restores the Terminal tab from local storage.
    render(<CanvasPanel {...base()} />);
    expect(screen.getByRole('tab', { name: 'Terminal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть Terminal' }));
    act(() => { vi.advanceTimersByTime(150); });
    expect(screen.queryByTestId('terminal')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('hyper.canvas.tabs.a')!).terms).toEqual([]);
  });
});
