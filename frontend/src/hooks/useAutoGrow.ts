import { useLayoutEffect, type RefObject } from 'react';

/** Chat-style textarea height: grows with content up to `max`, scrolls only beyond it. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, max = 164) {
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => {
      el.style.height = '0px';
      const style = getComputedStyle(el);
      const borders = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
      const full = el.scrollHeight + borders;
      el.style.height = `${Math.min(max, full)}px`;
      el.style.overflowY = full > max ? 'auto' : 'hidden';
    };
    fit();
    let lastWidth = el.clientWidth;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { if (el.clientWidth !== lastWidth) { lastWidth = el.clientWidth; fit(); } });
    observer?.observe(el); return () => observer?.disconnect();
  }, [ref, value, max]);
}
