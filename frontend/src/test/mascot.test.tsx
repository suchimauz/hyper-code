import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrabMascot } from '../components/hyper/CrabMascot';
import type { EventPage } from '../lib/hyper';
const animate = vi.fn(() => ({ cancel: vi.fn() }));
const page = (mascot: EventPage['mascot'], agentId = 'one'): EventPage => ({ mascot, agentId, events: [], olderBefore: null, hasOlder: false, isRunning: false, runState: 'idle', lastError: null, partial: null });
beforeEach(() => { animate.mockClear(); Element.prototype.animate = animate as unknown as typeof Element.prototype.animate; });
describe('persistent chat mascots', () => {
  it.each(['crab', 'deepy', 'whalegirl'] as const)('renders %s from server assignment and preserves it on updates', pet => {
    const { container, rerender } = render(<CrabMascot page={page(pet)} />);
    expect(container.firstChild).toHaveAttribute('data-pet', pet);
    expect((container.firstChild as HTMLElement).style.getPropertyValue('--crab-body')).toContain(`/mascot/${pet}/idle`);
    rerender(<CrabMascot page={{ ...page(pet), isRunning: true }} />);
    expect(container.firstChild).toHaveAttribute('data-pet', pet);
    expect(container.firstChild).toHaveAttribute('data-animation', 'typing');
  });
  it('uses Whalegirl variable timing and gutterless 21-column idle sheet', () => {
    const { container } = render(<CrabMascot page={page('whalegirl')} />);
    expect((container.firstChild as HTMLElement).style.getPropertyValue('--crab-sheet-width')).toBe('2898px');
    const [frames] = animate.mock.calls.at(-1)! as unknown as [Keyframe[]];
    expect(frames[0].transform).toBe('translate(0px, 0px)');
    expect(Number(frames[1].offset) - Number(frames[0].offset)).not.toBeCloseTo(1 / 21);
  });
  it('resets reactions when switching chats', () => {
    const { container, rerender } = render(<CrabMascot page={page('deepy')} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(container.firstChild).toHaveAttribute('data-animation', 'tickle');
    rerender(<CrabMascot page={page('deepy', 'two')} />);
    expect(container.firstChild).toHaveAttribute('data-animation', 'idle');
  });
  it('keeps a still frame under reduced motion', () => {
    vi.mocked(matchMedia).mockReturnValueOnce({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    render(<CrabMascot page={page('whalegirl')} />);
    expect(animate).not.toHaveBeenCalled();
  });
});
