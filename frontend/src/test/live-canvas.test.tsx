import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveApp } from '../LiveApp';
import { useHyper } from '../hooks/useHyper';
import { useCanvas } from '../hooks/useCanvas';

vi.mock('../hooks/useHyper');
vi.mock('../hooks/useCanvas');
vi.mock('../components/hyper/Transcript', () => ({ Transcript: () => <div data-testid="transcript">Conversation</div> }));

const canvas = () => ({ view: null, open: true, activeItemId: 7, rev: '1', loading: false, error: null, setOpen: vi.fn().mockResolvedValue(undefined), refresh: vi.fn() });
const hyper = () => ({ selected: 'a', agents: [], page: null, events: [], loading: false, error: null, liveError: null, select: vi.fn(), refresh: vi.fn(), hasOlder: false, loadingOlder: false, loadOlder: vi.fn(), outline: [], loadThrough: vi.fn() });
let state: ReturnType<typeof canvas>;
let chat: ReturnType<typeof hyper>;
beforeEach(() => {
  state = canvas(); chat = hyper();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({projects:[], tasks:[], items:[{id:7,title:'Document',active:true,icon:'file-text'}]})));
  vi.mocked(useCanvas).mockImplementation(() => state);
  vi.mocked(useHyper).mockImplementation(() => chat as unknown as ReturnType<typeof useHyper>);
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear(); delete document.documentElement.dataset.theme; });

describe('LiveApp Canvas integration', () => {
  it('places chat in the primary pane and Canvas after the separator in the right pane', () => {
    render(<LiveApp />);
    const panel = screen.getByRole('region', { name: 'Canvas' });
    const conversation = screen.getByRole('region', { name: 'Чат' });
    const right = panel.closest('.split-secondary')!;
    expect(conversation.closest('.split-primary')).not.toBeNull();
    expect(right.previousElementSibling).toBe(screen.getByRole('separator', { name: 'Ширина Canvas' }));
    expect(screen.getByTestId('transcript')).toBeInTheDocument();
    expect(useCanvas).toHaveBeenCalledWith('a');
  });

  it('keeps the same item frame across close, reopen, and revision changes', async () => {
    const ui = render(<LiveApp />);
    const frame = await screen.findByTitle('Canvas: Document') as HTMLIFrameElement;
    const doc = document.implementation.createHTMLDocument('shell');
    doc.body.innerHTML = '<main data-mobile-canvas><textarea>draft</textarea></main>';
    const resync = vi.fn();
    Object.defineProperty(frame, 'contentDocument', { configurable: true, value: doc });
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { hyperLive: { resync } } });
    fireEvent.load(frame); resync.mockClear();
    fireEvent.click(within(screen.getByRole('region', { name: 'Canvas' })).getByRole('button', { name: 'Свернуть Canvas' }));
    expect(state.setOpen).toHaveBeenCalledWith(false);
    state = { ...state, open: false }; ui.rerender(<LiveApp />);
    expect(frame.closest('.live-workspace')).toHaveClass('no-canvas');
    expect(screen.getByTitle('Canvas: Document')).toBe(frame);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть Canvas' }));
    expect(state.setOpen).toHaveBeenCalledWith(true);
    state = { ...state, open: true, rev: '2' }; ui.rerender(<LiveApp />);
    expect(frame.closest('.live-workspace')).toHaveClass('has-canvas');
    expect(screen.getByTitle('Canvas: Document')).toBe(frame);
    expect(frame.contentDocument).toBe(doc);
    expect(doc.querySelector('textarea')?.value).toBe('draft');
    expect(resync).not.toHaveBeenCalled();
  });

  it('loads an agent-bound document when switching agents', async () => {
    const ui = render(<LiveApp />); const first = await screen.findByTitle('Canvas: Document');
    chat = { ...chat, selected: 'b /?' }; ui.rerender(<LiveApp />);
    await waitFor(() => expect(screen.getByTitle('Canvas: Document')).toHaveAttribute('src', '/canvas/b%20%2F%3F/item/7/document?theme=light'));
    expect(screen.getByTitle('Canvas: Document')).not.toBe(first);
    expect(useCanvas).toHaveBeenLastCalledWith('b /?');
  });

  it('propagates the selected app theme to the loaded Canvas shell', async () => {
    render(<LiveApp />);
    const frame = await screen.findByTitle('Canvas: Document') as HTMLIFrameElement;
    const doc = document.implementation.createHTMLDocument('shell'); doc.body.innerHTML = '<main data-mobile-canvas></main>';
    Object.defineProperty(frame, 'contentDocument', { configurable: true, value: doc });
    fireEvent.load(frame);
    expect(frame).toHaveAttribute('src', '/canvas/a/item/7/document?theme=light');
    fireEvent.click(screen.getByRole('button', { name: 'Тема: Системная. Переключить на: Светлая' }));
    fireEvent.click(screen.getByRole('button', { name: 'Тема: Светлая. Переключить на: Тёмная' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(frame).toHaveAttribute('src', '/canvas/a/item/7/document?theme=dark');
    expect(screen.getByTitle('Canvas: Document')).toBe(frame);
  });
});
