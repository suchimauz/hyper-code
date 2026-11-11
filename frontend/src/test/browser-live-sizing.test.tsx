import { render, screen, act } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { BrowserLive } from '../../../plugins/browser/ui/index';

afterEach(() => vi.unstubAllGlobals());

test('fits the entire frame in both narrow and wide viewers without distorting coordinates', () => {
 let resize: ResizeObserverCallback;
 let width = 320, height = 600;
 vi.stubGlobal('ResizeObserver', class {
  constructor(callback: ResizeObserverCallback) { resize = callback; }
  observe(el: HTMLElement) {
   el.getBoundingClientRect = () => ({ width, height }) as DOMRect;
   resize([], this as unknown as ResizeObserver);
  }
  disconnect() {}
 });
 render(<BrowserLive context={{ agentId: null, theme: 'dark', readOnly: true }} />);
 const canvas = screen.getByLabelText('Live browser screen; enable control to interact');
 expect(canvas).toHaveStyle({ width: '320px', height: '240px' });
 width = 1200; height = 300;
 act(() => resize([], {} as ResizeObserver));
 expect(canvas).toHaveStyle({ width: '400px', height: '300px' });
 expect(canvas.parentElement).toHaveStyle({ height: '65vh', display: 'flex' });
});
