import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import './page-viewport.css';


/** Full-width scroll region with independently resizable, centered transcript and composer. */
export function WidthViewport({ children, disabled = false, widthControlTarget, kind = 'chat' }: { children: ReactNode; disabled?: boolean; widthControlTarget?: HTMLElement | null; kind?: 'chat' | 'page' }) {
  const KEY = kind === 'chat' ? 'hyper-ui.chat-content-width-v2' : 'hyper-ui.page-content-width-v1';
  const label = kind === 'chat' ? 'чата' : 'страницы';
  const root = useRef<HTMLDivElement>(null);
  const [column, setColumn] = useState(1250);
  const [width, setWidth] = useState<number | 'full' | null>(() => {
    try { const value = localStorage.getItem(KEY); return value === 'full' ? 'full' : value && Number.isFinite(Number(value)) ? Math.max(640, Number(value)) : null; } catch { return null; }
  });
  useLayoutEffect(() => {
    const node = root.current; if (!node) return;
    const measure = () => setColumn(node.clientWidth || 1250);
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const node = root.current; if (!node) return;
    if (kind !== 'chat') return;
    let bottom: Element | null = null;
    let scroll: HTMLElement | null = null;
    const measure = () => {
      const height = bottom?.getBoundingClientRect().height ?? 0;
      const following = scroll ? scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 100 : false;
      node.style.setProperty('--composer-height', `${height}px`);
      node.style.setProperty('--chat-scrollbar-gutter', `${scroll ? scroll.offsetWidth - scroll.clientWidth : 0}px`);
      if (following && scroll) scroll.scrollTop = scroll.scrollHeight;
    };
    const observer = new ResizeObserver(measure);
    const bind = () => {
      const nextBottom = node.querySelector(':scope > .chat-bottom');
      const nextScroll = node.querySelector<HTMLElement>('.chat-scroll');
      if (nextBottom === bottom && nextScroll === scroll) return;
      observer.disconnect(); bottom = nextBottom; scroll = nextScroll;
      if (bottom) observer.observe(bottom);
      if (scroll) observer.observe(scroll);
      measure();
    };
    const mutations = new MutationObserver(bind);
    mutations.observe(node, { childList: true, subtree: true }); bind();
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, []);
  const defaultWidth = Math.max(680, Math.min(column * .64, 920));
  const resolvedWidth = width === 'full' ? column - 64 : width == null ? defaultWidth : Math.min(Math.max(width, 640), Math.max(640, column - 176));
  const drag = useRef<{ x: number; width: number } | null>(null);
  const update = (value: number | 'full' | null) => {
    if (disabled) return;
    setWidth(value); try { if (value == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(value)); } catch { /* Resizing remains available without storage. */ }
  };
  const available = () => Math.max(640, column - 176);
  const actual = () => resolvedWidth;
  const resize = (value: number) => update(Math.min(available(), Math.max(640, value)));
  return <div ref={root} className={`chat-viewport ${kind === 'page' ? 'page-viewport' : ''}`} style={{ '--chat-content-width': `${resolvedWidth}px` } as CSSProperties}>
    {widthControlTarget ? createPortal(<IconButton disabled={disabled} label={width === 'full' ? `Обычная ширина ${label}` : `${kind === 'chat' ? 'Чат' : 'Страница'} на всю ширину панели`} aria-pressed={width === 'full'} onClick={() => update(width === 'full' ? null : 'full')}>{width === 'full' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</IconButton>, widthControlTarget) : widthControlTarget === undefined ? <div className="chat-width-toolbar"><IconButton disabled={disabled} label={width === 'full' ? `Обычная ширина ${label}` : `${kind === 'chat' ? 'Чат' : 'Страница'} на всю ширину панели`} aria-pressed={width === 'full'} onClick={() => update(width === 'full' ? null : 'full')}>{width === 'full' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</IconButton></div> : null}
    {kind === 'page' ? <div className="page-scroll-viewport"><div className="page-width-content">{children}</div></div> : children}
    {(['left', 'right'] as const).map(side => <div key={side} className={`chat-width-handle chat-width-handle--${side}`} role="separator" aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0} aria-label={`Ширина содержимого ${label} — ${side === 'left' ? 'слева' : 'справа'}`} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={width === 'full' ? 100 : Math.min(100, Math.round(resolvedWidth / available() * 100))} aria-valuetext={width === 'full' ? 'Вся ширина' : `${Math.round(resolvedWidth)} пикселей, ограничено панелью`}
      onDoubleClick={() => update(null)}
      onKeyDown={event => {
        if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); update(event.key === 'End' ? 'full' : 640); }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resize(actual() + (event.key === 'ArrowRight' ? 32 : -32) * (side === 'right' ? 1 : -1)); }
      }}
      onPointerDown={event => { if (disabled) return; drag.current = { x: event.clientX, width: actual() }; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.dragging = ''; }}
      onPointerMove={event => { event.currentTarget.style.setProperty('--pointer-y', `${event.nativeEvent.offsetY}px`); if (drag.current && event.currentTarget.hasPointerCapture(event.pointerId)) resize(drag.current.width + (event.clientX - drag.current.x) * (side === 'right' ? 2 : -2)); }}
      onPointerUp={event => { drag.current = null; delete event.currentTarget.dataset.dragging; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onLostPointerCapture={event => { drag.current = null; delete event.currentTarget.dataset.dragging; }}
      onPointerCancel={event => { drag.current = null; delete event.currentTarget.dataset.dragging; }}
    />)}
  </div>;
}
