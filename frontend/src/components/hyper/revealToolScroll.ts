/** Reveal from the innermost scrollport outwards, once, after disclosure layout.
 * Each outer stage measures the now-visible (clipped) bottom, not the offscreen raw row.
 * Returns cancellation for gestures, navigation, another disclosure and unmount. */
export function revealToolScroll(scroll: HTMLElement, target: HTMLElement, done: () => void) {
  let frame = 0;
  let stopped = false;
  const ports: HTMLElement[] = [];
  for (let node = target.parentElement; node && node !== scroll; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) ports.push(node);
  }
  ports.push(scroll);
  const previous = ports.map(port => ({ anchor: port.style.overflowAnchor, behavior: port.style.scrollBehavior }));
  ports.forEach(port => { port.dataset.toolRevealing = 'true'; port.style.overflowAnchor = 'none'; port.style.scrollBehavior = 'auto'; });
  const restore = () => ports.forEach((port, index) => {
    delete port.dataset.toolRevealing;
    port.style.overflowAnchor = previous[index].anchor;
    port.style.scrollBehavior = previous[index].behavior;
  });
  const finish = () => { if (stopped) return; stopped = true; restore(); done(); };
  const visible = () => target.isConnected && target.getClientRects().length && target.querySelector('.tool-row-summary')?.getAttribute('aria-expanded') === 'true';
  const stage = (index: number) => {
    if (stopped) return;
    if (index >= ports.length || !visible()) { finish(); return; }
    const port = ports[index];
    let bottom = target.getBoundingClientRect().bottom;
    for (let inner = 0; inner < index; inner++) {
      const clip = ports[inner];
      bottom = Math.min(bottom, clip.getBoundingClientRect().top + clip.clientTop + clip.clientHeight);
    }
    const start = port.scrollTop;
    const floor = port.getBoundingClientRect().top + port.clientTop + port.clientHeight;
    const end = Math.max(start, Math.min(port.scrollHeight - port.clientHeight, start + bottom - floor + 12));
    if (end - start < 1) { stage(index + 1); return; }
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300;
    const began = performance.now();
    const step = (now: number) => {
      if (stopped) return;
      if (!visible()) { finish(); return; }
      const progress = duration ? Math.min(1, (now - began) / duration) : 1;
      port.scrollTop = start + (end - start) * (1 - (1 - progress) ** 3);
      if (progress < 1) frame = requestAnimationFrame(step); else stage(index + 1);
    };
    frame = requestAnimationFrame(step);
  };
  const timer = setTimeout(() => stage(0), 100);
  return () => { if (stopped) return; stopped = true; clearTimeout(timer); cancelAnimationFrame(frame); restore(); };
}
