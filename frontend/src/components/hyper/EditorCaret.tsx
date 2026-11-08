import { useLayoutEffect, useRef, type RefObject } from 'react';
/** Overlay only; never inserts measurement nodes into the editable document. */
export function EditorCaret({ input, value }: { input: RefObject<HTMLDivElement | null>; value: string }) {
  const layer = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = input.current, caret = layer.current; if (!el || !caret) return;
    let frame = 0, composing = false;
    const hide = () => { caret.style.visibility = 'hidden'; delete el.dataset.visualCaret; };
    const update = () => {
      const selection = window.getSelection(), style = getComputedStyle(el);
      if (document.activeElement !== el || composing || el.getAttribute('aria-disabled') === 'true' || !selection?.isCollapsed || !selection.rangeCount || !el.contains(selection.anchorNode) || style.direction === 'rtl' || /[\u0590-\u08ff]/u.test(el.textContent || '') || matchMedia('(forced-colors: active)').matches) { hide(); return; }
      const range = selection.getRangeAt(0).cloneRange();
      let point = range.getClientRects?.()[0];
      const tail = el.querySelector('[data-editor-tail]');
      if (!point?.height && tail) {
        const before = range.cloneRange(); before.selectNodeContents(el); before.setEnd(range.startContainer, range.startOffset);
        if (before.toString().length === el.textContent?.length) point = tail.getBoundingClientRect();
      }
      const box = el.getBoundingClientRect();
      let x = point?.left, y = point?.top, height = point?.height;
      if (!point && !el.textContent) { x = box.left + parseFloat(style.paddingLeft || '0'); height = parseFloat(style.fontSize) * 1.2857; y = box.top + (parseFloat(style.lineHeight) - height) / 2; }
      if (x == null || y == null || !height || y < box.top || y + height > box.bottom + 1 || x < box.left || x > box.right) { hide(); return; }
      const parent = caret.offsetParent as HTMLElement | null; if (!parent) { hide(); return; }
      const origin = parent.getBoundingClientRect();
      caret.style.height = `${height}px`;
      caret.style.transform = `translate(${x - origin.left - parent.clientLeft}px, ${y - origin.top - parent.clientTop}px)`;
      caret.style.visibility = 'visible'; el.dataset.visualCaret = 'true';
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const start = () => { composing = true; hide(); }, end = () => { composing = false; schedule(); };
    const observer = new ResizeObserver(schedule); observer.observe(el);
    document.addEventListener('selectionchange', schedule);
    for (const name of ['input', 'focus', 'keyup', 'pointerup', 'scroll']) el.addEventListener(name, schedule);
    el.addEventListener('blur', hide); el.addEventListener('compositionstart', start); el.addEventListener('compositionend', end);
    window.addEventListener('blur', hide); window.addEventListener('focus', schedule); window.addEventListener('resize', schedule);
    update();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); hide(); document.removeEventListener('selectionchange', schedule);
      for (const name of ['input', 'focus', 'keyup', 'pointerup', 'scroll']) el.removeEventListener(name, schedule);
      el.removeEventListener('blur', hide); el.removeEventListener('compositionstart', start); el.removeEventListener('compositionend', end);
      window.removeEventListener('blur', hide); window.removeEventListener('focus', schedule); window.removeEventListener('resize', schedule);
    };
  }, [input, value]);
  return <span className="input-caret" ref={layer} aria-hidden="true" />;
}
