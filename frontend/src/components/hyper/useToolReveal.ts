import { useLayoutEffect, useRef } from 'react';

/** Reveal only a reader-opened tool, including its asynchronously loaded body.
 * A subsequent reading gesture cancels pending positioning; automatic live opens do not opt in. */
export function useToolReveal(open: boolean, content: unknown, ready = true) {
  const row = useRef<HTMLElement>(null);
  const requested = useRef(false);
  useLayoutEffect(() => {
    const element = row.current;
    if (!open || !requested.current || !element) return;
    element.dispatchEvent(new CustomEvent('hyper:reveal-tool', { bubbles: true, detail: { element, ready } }));
    if (ready) requested.current = false;
    const scroll = element.closest('.chat-scroll');
    const cancel = () => { requested.current = false; };
    scroll?.addEventListener('wheel', cancel, { passive: true });
    scroll?.addEventListener('touchstart', cancel, { passive: true });
    scroll?.addEventListener('pointerdown', cancel);
    scroll?.addEventListener('keydown', cancel);
    return () => {
      scroll?.removeEventListener('wheel', cancel);
      scroll?.removeEventListener('touchstart', cancel);
      scroll?.removeEventListener('pointerdown', cancel);
      scroll?.removeEventListener('keydown', cancel);
    };
  }, [open, content, ready]);
  return { row, requestReveal: (nextOpen: boolean) => { requested.current = nextOpen; } };
}
