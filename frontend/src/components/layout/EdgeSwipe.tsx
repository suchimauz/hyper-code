import { useRef } from 'react';
export type EdgeSwipeProps = {
  side: 'left' | 'right'; onSwipe: () => void; disabled?: boolean; label: string;
  /** Live finger offset in px (signed, screen direction) while dragging; null when the gesture ends. */
  onDrag?: (offset: number | null) => void;
};
/**
 * Invisible touch strip on a screen edge for an inward horizontal swipe (left edge → right,
 * right edge → left). Reports the live offset through `onDrag` so a panel can follow the finger,
 * and fires `onSwipe` on release past a quarter of the screen or after a quick flick.
 * Being a real element it also works above iframes, which swallow document touch events.
 */
export function EdgeSwipe({ side, onSwipe, disabled = false, label, onDrag }: EdgeSwipeProps) {
  const gesture = useRef<{ x: number; y: number; t: number; id: number; dx: number; active: boolean } | null>(null);
  if (disabled) return null;
  const sign = side === 'left' ? 1 : -1;
  const end = (commit: boolean) => { gesture.current = null; onDrag?.(null); if (commit) onSwipe(); };
  return <div aria-hidden="true" title={label} className={`edge-swipe edge-swipe--${side}`}
    onPointerDown={event => { if (event.pointerType === 'mouse') return; gesture.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, id: event.pointerId, dx: 0, active: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => {
      const g = gesture.current; if (!g || g.id !== event.pointerId) return;
      const dx = Math.max(0, (event.clientX - g.x) * sign); const dy = Math.abs(event.clientY - g.y);
      if (!g.active) { if (dy > 12 && dy > dx) { end(false); return; } if (dx < 8) return; g.active = true; }
      g.dx = dx; onDrag?.(dx * sign);
    }}
    onPointerUp={event => {
      const g = gesture.current; if (!g || g.id !== event.pointerId) return;
      const velocity = g.dx / Math.max(1, event.timeStamp - g.t);
      end(g.active && (g.dx > window.innerWidth / 4 || (g.dx > 40 && velocity > .5)));
    }}
    onPointerCancel={() => { if (gesture.current) end(false); }} />;
}
