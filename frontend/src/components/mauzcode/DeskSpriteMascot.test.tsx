import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { DeskSpriteMascot } from './DeskSpriteMascot';
import type { EventPage } from '../../lib/mauzcode';

vi.mock('../../vendor/desksprite/desksprite.js', () => ({}));
const setStatus = vi.fn(), destroy = vi.fn();
const start = vi.fn((_options: Parameters<Window['DeskSprite']['start']>[0]) => ({ setStatus, destroy, say: vi.fn(), el: null }));
const page = (values: Partial<EventPage> = {}) => ({ agentId: 'one', ...values }) as EventPage;
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); window.DeskSprite = { start }; });
afterEach(() => { vi.useRealTimers(); });
describe('DeskSpriteMascot', () => {
  it('starts the local engine in an isolated empty mount and cleans up', () => {
    const { unmount } = render(<DeskSpriteMascot page={null} />);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mount: expect.any(HTMLElement), roam: false, clock: false, lunch: false, scale: 80 / 238 }));
    expect(start.mock.calls[0]?.[0]?.mount.childElementCount).toBe(0);
    expect(setStatus).toHaveBeenLastCalledWith('idle');
    unmount(); expect(destroy).toHaveBeenCalledOnce();
  });
  it('maps real running, thinking, tools, completion, and errors', () => {
    const { rerender } = render(<DeskSpriteMascot page={page({ isRunning: true })} />);
    expect(setStatus).toHaveBeenLastCalledWith('working');
    rerender(<DeskSpriteMascot page={page()} />);
    expect(setStatus).toHaveBeenLastCalledWith('done');
    act(() => vi.advanceTimersByTime(3000));
    expect(setStatus).toHaveBeenLastCalledWith('idle');
    rerender(<DeskSpriteMascot page={page({ thinking: { startedAt: 1 } })} />);
    expect(setStatus).toHaveBeenLastCalledWith('working');
    rerender(<DeskSpriteMascot page={page({ activeTools: [{ name: 'bash' }] as EventPage['activeTools'] })} />);
    expect(screen.getByRole('button')).toHaveAccessibleName('DeskSprite: Выполняет инструмент');
    rerender(<DeskSpriteMascot page={page({ lastError: 'Failed' })} />);
    expect(setStatus).toHaveBeenLastCalledWith('error');
  });
  it('exposes a native keyboard button without drag/throw', () => {
    render(<DeskSpriteMascot page={null} />);
    const button = screen.getByRole('button');
    button.focus(); expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(screen.getByRole('status')).toHaveTextContent('Отдыхает');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
  it('recreates static frames when reduced motion changes', () => {
    const original = window.matchMedia;
    let change: () => void = () => {};
    const media = { matches: false, addEventListener: vi.fn((_name, fn) => { change = fn; }), removeEventListener: vi.fn() };
    window.matchMedia = vi.fn(() => media as unknown as MediaQueryList);
    const { unmount } = render(<DeskSpriteMascot page={page({ isRunning: true })} />);
    media.matches = true;
    act(() => change());
    expect(destroy).toHaveBeenCalledOnce();
    expect(start).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'working' }));
    unmount(); expect(media.removeEventListener).toHaveBeenCalled();
    window.matchMedia = original;
  });
  it('remounts when the agent changes and survives StrictMode cleanup', () => {
    const { rerender, unmount } = render(<StrictMode><DeskSpriteMascot page={page()} /></StrictMode>);
    expect(start).toHaveBeenCalledTimes(2); expect(destroy).toHaveBeenCalledTimes(1);
    rerender(<StrictMode><DeskSpriteMascot page={page({ agentId: 'two' })} /></StrictMode>);
    expect(destroy).toHaveBeenCalledTimes(3);
    unmount(); expect(destroy).toHaveBeenCalledTimes(4);
  });
});
