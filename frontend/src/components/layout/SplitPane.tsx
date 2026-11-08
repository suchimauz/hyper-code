import { useRef, type CSSProperties, type ReactNode } from 'react';
export type SplitPaneProps = {
  primary: ReactNode; secondary: ReactNode; secondaryWidth: number;
  onWidthChange: (width: number) => void; minWidth?: number; maxWidth?: number; label?: string;
};
/** Controlled desktop split. Pointer capture and arrow keys resize the secondary panel. */
export function SplitPane({ primary, secondary, secondaryWidth, onWidthChange, minWidth = 320, maxWidth = 640, label = 'Ширина чата' }: SplitPaneProps) {
  const root = useRef<HTMLDivElement>(null);
  const resize = (value: number) => onWidthChange(Math.min(maxWidth, Math.max(minWidth, value)));
  return <div ref={root} className="split-pane" style={{ '--secondary-width': `${secondaryWidth}px` } as CSSProperties}>
    <div className="split-primary">{primary}</div>
    <div className="split-handle" role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical" aria-valuemin={minWidth} aria-valuemax={maxWidth} aria-valuenow={secondaryWidth}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resize(secondaryWidth + (event.key === 'ArrowLeft' ? 16 : -16)); }
        if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); resize(event.key === 'Home' ? minWidth : maxWidth); }
      }}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId) && root.current) resize(root.current.getBoundingClientRect().right - event.clientX); }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    /><div className="split-secondary">{secondary}</div>
  </div>;
}
