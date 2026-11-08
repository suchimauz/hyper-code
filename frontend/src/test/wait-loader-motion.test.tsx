import { expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { WaitLoader } from '../components/hyper/WaitLoader';

it.each(['missing', 'pending', 'zero-duration', 'valid', 'disappears', 'throws'] as const)('survives StrictMode and %s CSS motion', mode => {
  vi.useFakeTimers();
  const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  const originalAnimations = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getAnimations');
  const cssCancel = vi.fn(), handoverCancel = vi.fn();
  let missing = mode === 'missing';
  class FakeCSSAnimation {
    id = ''; currentTime = mode === 'pending' ? null : 0; startTime = 0;
    effect = { getTiming: () => ({ duration: mode === 'zero-duration' ? 0 : 500, delay: 0, direction: 'alternate' }) };
    cancel = cssCancel;
  }
  const css = new FakeCSSAnimation();
  const handover = { id: 'wait-loader-handover', cancel: handoverCancel, startTime: 0, finished: new Promise(() => {}) };
  const animations = vi.fn(() => missing ? [] : [css, handover]);
  const animate = vi.fn(() => { if (mode === 'throws') throw new Error('Animation unavailable'); return handover; });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', { configurable: true, value: animations });
  const timeline = Object.getOwnPropertyDescriptor(document, 'timeline');
  Object.defineProperty(document, 'timeline', { configurable: true, value: { currentTime: 0 } });
  const addEventListener = vi.fn(), removeEventListener = vi.fn();
  vi.stubGlobal('CSSAnimation', FakeCSSAnimation);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener, removeEventListener }));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const view = render(<StrictMode><WaitLoader /></StrictMode>);
    const root = view.container.querySelector('.wait-loader')!;
    if (mode === 'valid' || mode === 'disappears') {
      expect(root).not.toHaveAttribute('data-static');
      expect(vi.getTimerCount()).toBe(1);
      expect(animate).toHaveBeenCalled();
      if (mode === 'disappears') { missing = true; act(() => vi.advanceTimersByTime(10000)); }
    }
    if (mode !== 'valid') {
      expect(root).toHaveAttribute('data-static');
      expect(root.querySelector('.is-active')).toHaveClass('is-bounce');
      expect(vi.getTimerCount()).toBe(0);
    }
    expect(cssCancel).not.toHaveBeenCalled();
    view.unmount();
    expect(cssCancel).not.toHaveBeenCalled();
    expect(removeEventListener).toHaveBeenCalledTimes(addEventListener.mock.calls.length);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    for (const [name, descriptor] of [['animate', originalAnimate], ['getAnimations', originalAnimations]] as const) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, name);
    }
    if (timeline) Object.defineProperty(document, 'timeline', timeline); else Reflect.deleteProperty(document, 'timeline');
    warning.mockRestore(); vi.unstubAllGlobals(); vi.useRealTimers();
  }
});
