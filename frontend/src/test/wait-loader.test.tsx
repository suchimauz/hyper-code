import { expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { WaitLoader } from '../components/mauzcode/WaitLoader';

it('renders all three original lanes with 3, 3 and 4 decorative dots', () => {
  const view = render(<WaitLoader />);
  expect(view.container.querySelector('.wait-loader')).toHaveAttribute('aria-hidden', 'true');
  for (const [mode, count] of [['bounce', 3], ['line', 3], ['orbit', 4]] as const) {
    expect(view.container.querySelectorAll(`.is-${mode} .wait-loader-dot`)).toHaveLength(count);
  }
  view.unmount();
});

it('keeps reduced-motion static, schedules no rotations, and cleans up listeners/animations', () => {
  vi.useFakeTimers();
  const addEventListener = vi.fn(), removeEventListener = vi.fn(), cancel = vi.fn();
  const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  const originalAnimations = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getAnimations');
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', { configurable: true, value: () => [{ id: 'css-motion', cancel }] });
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener, removeEventListener }));
  try {
    const view = render(<WaitLoader />);
    expect(view.container.querySelector('.wait-loader')).toHaveAttribute('data-reduced-motion');
    expect(view.container.querySelectorAll('.is-active')).toHaveLength(1);
    expect(view.container.querySelectorAll('.is-resting')).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
    view.unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', addEventListener.mock.calls[0][1]);
    expect(cancel).not.toHaveBeenCalled();
  } finally {
    if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    if (originalAnimations) Object.defineProperty(HTMLElement.prototype, 'getAnimations', originalAnimations);
    else Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations');
    vi.unstubAllGlobals(); vi.useRealTimers();
  }
});
