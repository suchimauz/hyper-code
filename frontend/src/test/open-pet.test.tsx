import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CrabMascot } from '../components/mauzcode/CrabMascot';
import type { EventPage } from '../lib/mauzcode';
const cancel = vi.fn();
const animate = vi.fn(() => ({ cancel }));
const page = (mascot: EventPage['mascot']): EventPage => ({ mascot, agentId: 'pet', events: [], olderBefore: null, hasOlder: false, isRunning: false, runState: 'idle', lastError: null, partial: null });
beforeEach(() => { vi.clearAllMocks(); Element.prototype.animate = animate as unknown as typeof Element.prototype.animate; });
it.each(['bitty', 'tmuxai', 'planet', 'rainbow-terminal-cat'] as const)('renders local %s and preserves its assignment during activity', pet => {
  const { container, rerender, unmount } = render(<CrabMascot page={page(pet)} />);
  expect(container.firstChild).toHaveAttribute('data-pet', pet);
  expect((container.firstChild as HTMLElement).style.getPropertyValue('--open-pet-sheet')).toContain(`/mascot/${pet}/spritesheet.webp`);
  fireEvent.click(screen.getByRole('button'));
  expect(container.firstChild).toHaveAttribute('data-animation', 'waving');
  rerender(<CrabMascot page={{ ...page(pet), agentId: 'other', thinking: { startedAt: 1 }, isRunning: true }} />);
  expect(container.firstChild).toHaveAttribute('data-pet', pet);
  expect(container.firstChild).toHaveAttribute('data-animation', 'review');
  expect(screen.getByRole('button')).toBeDisabled();
  unmount(); expect(cancel).toHaveBeenCalled();
});
it('uses the atlas row and six-frame idle timing, then maps errors', () => {
  const { container, rerender } = render(<CrabMascot page={page('planet')} />);
  const calls = animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
  expect(calls[0][0]).toHaveLength(7);
  expect(calls[0][1]).toMatchObject({ duration: 1800, iterations: Infinity });
  rerender(<CrabMascot page={{ ...page('planet'), lastError: 'failed' }} />);
  expect(container.firstChild).toHaveAttribute('data-animation', 'failed');
  expect((container.querySelector('.open-pet-strip') as HTMLElement).style.transform).toBe('translate(0px, -390px)');
});
it('does not animate under reduced motion, including interaction', () => {
  vi.mocked(matchMedia).mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
  render(<CrabMascot page={page('bitty')} />);
  fireEvent.click(screen.getByRole('button'));
  expect(animate).not.toHaveBeenCalled();
});
