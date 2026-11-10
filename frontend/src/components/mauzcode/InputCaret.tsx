import { useLayoutEffect, useRef, type RefObject } from 'react';

type Props = { input: RefObject<HTMLTextAreaElement | null>; value: string };
/** Visual caret only: the textarea retains native editing, selection, IME and accessibility. */
export function InputCaret({ input, value }: Props) {
  const layer = useRef<HTMLSpanElement>(null);
  const composing = useRef(false);
  useLayoutEffect(() => {
    const el = input.current, caret = layer.current;
    if (!el || !caret) return;
    const mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    const marker = document.createElement('span');
    let frame = 0;
    const hide = () => { caret.style.visibility = 'hidden'; delete el.dataset.visualCaret; };
    const update = () => {
      if (document.activeElement !== el || composing.current || el.disabled || el.selectionStart !== el.selectionEnd || !el.clientWidth) { hide(); return; }
      const style = getComputedStyle(el);
      // Native caret is safer for bidi/RTL shaping and forced-colour accessibility.
      if (style.direction === 'rtl' || /[\u0590-\u08ff]/u.test(el.value) || matchMedia('(forced-colors: active)').matches) { hide(); return; }
      Object.assign(mirror.style, {
        position: 'fixed', top: '0', left: '-10000px', visibility: 'hidden', pointerEvents: 'none',
        boxSizing: 'border-box', width: `${el.clientWidth}px`, padding: style.padding,
        border: '0', font: style.font, fontFamily: style.fontFamily, fontSize: style.fontSize,
        fontWeight: style.fontWeight, fontStyle: style.fontStyle, lineHeight: style.lineHeight,
        fontVariationSettings: style.fontVariationSettings, fontOpticalSizing: style.fontOpticalSizing,
        letterSpacing: style.letterSpacing, tabSize: style.tabSize,
        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: style.wordBreak,
      });
      mirror.replaceChildren(document.createTextNode(el.value.slice(0, el.selectionStart)), marker);
      marker.textContent = el.value.slice(el.selectionStart) || '\u200b';
      const range = document.createRange(); range.setStart(marker.firstChild!, 0); range.collapse(true);
      const point = range.getClientRects()[0];
      if (!point) { hide(); return; }
      const base = mirror.getBoundingClientRect(), box = el.getBoundingClientRect();
      const parent = caret.offsetParent as HTMLElement | null;
      if (!parent) { hide(); return; }
      const origin = parent.getBoundingClientRect();
      const height = Math.min(parseFloat(style.lineHeight), point.height || parseFloat(style.fontSize));
      const x = point.left - base.left - el.scrollLeft;
      const y = point.top - base.top - el.scrollTop;
      if (y < 0 || y + height > el.clientHeight + 1 || x < 0 || x > el.clientWidth) { hide(); return; }
      caret.style.height = `${height}px`;
      caret.style.transform = `translate(${box.left - origin.left - parent.clientLeft + x}px, ${box.top - origin.top - parent.clientTop + y}px)`;
      caret.style.visibility = 'visible';
      el.dataset.visualCaret = 'true';
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const startComposition = () => { composing.current = true; hide(); };
    const endComposition = () => { composing.current = false; schedule(); };
    const blur = () => { cancelAnimationFrame(frame); hide(); };
    el.parentElement!.append(mirror);
    const observer = new ResizeObserver(schedule); observer.observe(el);
    document.addEventListener('selectionchange', schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    for (const event of ['focus', 'input', 'keyup', 'pointerup', 'scroll']) el.addEventListener(event, schedule);
    el.addEventListener('blur', blur);
    el.addEventListener('compositionstart', startComposition);
    el.addEventListener('compositionend', endComposition);
    window.addEventListener('blur', blur); window.addEventListener('focus', schedule);
    update();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); mirror.remove(); hide();
      document.removeEventListener('selectionchange', schedule);
      document.fonts?.removeEventListener('loadingdone', schedule);
      for (const event of ['focus', 'input', 'keyup', 'pointerup', 'scroll']) el.removeEventListener(event, schedule);
      el.removeEventListener('blur', blur);
      el.removeEventListener('compositionstart', startComposition);
      el.removeEventListener('compositionend', endComposition);
      window.removeEventListener('blur', blur); window.removeEventListener('focus', schedule);
    };
  }, [input, value]);
  return <span ref={layer} className="input-caret" aria-hidden="true" />;
}
