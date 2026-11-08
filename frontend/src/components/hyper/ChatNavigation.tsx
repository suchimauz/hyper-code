import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { ChatEvent } from '../../lib/hyper';
import './chat-navigation.css';

/** A stable event anchor from the complete, paginated conversation outline. */
export type ChatNavigationItem = { idx: number; prompt: string; turn?: number };
type Props = {
  events: ChatEvent[];
  scrollRef: RefObject<HTMLDivElement | null>;
  outline?: ChatNavigationItem[];
  loadThrough?: (idx: number) => Promise<void>;
  onNavigateStart?: () => void;
};
const PITCH = 24;
/** Durable provenance wins; legacy peers are excluded until their metadata projection arrives. */
export function isNavigationInput(event: ChatEvent): boolean {
  const source = event as ChatEvent & { navigationEligible?: boolean; agentMessage?: object; author?: { kind?: string }; actor?: string };
  if (source.navigationEligible != null) return source.navigationEligible;
  return !source.agentMessage && source.author?.kind !== 'agent' && !source.actor?.startsWith('agent:') && !/^\s*<(?:agent-message|team-update|shared-agent-result|input-result|canvas-ping)\b/.test(event.text || '');
}
/** Merge outline and loaded prompts without changing their stable event identities. */
export function navigationItems(events: ChatEvent[], outline: ChatNavigationItem[] = []) {
  const result = new Map(outline.map(item => [item.idx, { ...item, loaded: false }]));
  for (const event of events) if (event.type === 'user' && event.messageIdx != null && isNavigationInput(event)) {
    const previous = result.get(event.idx);
    result.set(event.idx, { ...previous, idx: event.idx, prompt: event.text || previous?.prompt || '', loaded: true });
  }
  return [...result.values()].sort((a, b) => a.idx - b.idx);
}
/** Locate a turn even when its body is inside a closed details group. */
export function navigationAnchor(root: HTMLElement, idx: number): HTMLElement | null {
  const element = root.querySelector<HTMLElement>(`[data-event-idx="${idx}"]`);
  if (!element) return null;
  const closed = element.closest<HTMLDetailsElement>('details:not([open])');
  return closed?.querySelector<HTMLElement>('summary') ?? closed ?? element;
}

/** Exact configured Claude-skin rail: 24px pitch, prompt list on hover, 240px cap. */
export function ChatNavigation({ events, scrollRef, outline, loadThrough, onNavigateStart }: Props) {
  const items = useMemo(() => navigationItems(events, outline), [events, outline]);
  const [active, setActive] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [height, setHeight] = useState(240);
  const slot = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const landedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const landed = useRef<HTMLElement | null>(null);
  const request = useRef(0);
  const latest = useRef({ items, loadThrough, onNavigateStart });
  latest.current = { items, loadThrough, onNavigateStart };
  const keyboard = useRef({ idx: -1, at: 0 });
  const pendingLanding = useRef<number | null>(null);
  const visibleHeight = Math.min(items.length * PITCH, height);
  const maxOffset = Math.max(0, items.length * PITCH - visibleHeight);
  const cancelClose = () => clearTimeout(closeTimer.current);
  const closeSoon = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 100); };

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const composerHeight = Number.parseFloat(getComputedStyle(root).getPropertyValue('--composer-height')) || 152;
      setHeight(Math.min(240, Math.max(0, root.clientHeight - composerHeight - 64)));
      const rows = latest.current.items.filter(item => item.loaded);
      if (!rows.length) { setActive(null); return; }
      if (pendingLanding.current != null) return;
      if (root.scrollHeight - root.scrollTop - root.clientHeight <= 2) { setActive(rows.at(-1)!.idx); return; }
      const line = root.getBoundingClientRect().top + Math.min(96, root.clientHeight * .2);
      let current = rows[0].idx;
      for (const item of rows) {
        const anchor = navigationAnchor(root, item.idx);
        if (anchor && anchor.getBoundingClientRect().top <= line) current = item.idx;
      }
      setActive(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const reader = () => { pendingLanding.current = null; };
    update();
    const resize = new ResizeObserver(schedule); resize.observe(root);
    if (root.firstElementChild) resize.observe(root.firstElementChild);
    root.addEventListener('scroll', schedule, { passive: true });
    root.addEventListener('wheel', reader, { passive: true }); root.addEventListener('touchstart', reader, { passive: true });
    return () => { resize.disconnect(); cancelAnimationFrame(frame); root.removeEventListener('scroll', schedule); root.removeEventListener('wheel', reader); root.removeEventListener('touchstart', reader); };
  }, [scrollRef, items]);

  useLayoutEffect(() => {
    const index = items.findIndex(item => item.idx === active);
    setOffset(previous => {
      let next = Math.min(previous, maxOffset);
      if (!open && index >= 0 && !(index * PITCH >= next + PITCH && index * PITCH + 48 <= next + visibleHeight)) next = Math.max(0, Math.min(maxOffset, index * PITCH - (visibleHeight - PITCH) / 2));
      return Math.round(next);
    });
  }, [active, items, open, visibleHeight, maxOffset]);
  useLayoutEffect(() => { if (open && list.current && list.current.scrollTop !== offset) list.current.scrollTop = offset; }, [open, offset]);
  useEffect(() => () => { request.current++; clearTimeout(closeTimer.current); clearTimeout(landedTimer.current); landed.current?.removeAttribute('data-chat-nav-landed'); }, []);

  const navigate = useCallback(async (idx: number) => {
    const token = ++request.current;
    const root = scrollRef.current;
    if (!root) return;
    latest.current.onNavigateStart?.(); setError(''); pendingLanding.current = idx;
    try {
      const item = latest.current.items.find(item => item.idx === idx);
      if (!item?.loaded) {
        if (!latest.current.loadThrough) throw new Error('История пока недоступна');
        setBusy(idx); await latest.current.loadThrough(idx);
        // The page promise resolves before React commits newly loaded anchors.
        await new Promise<void>(resolve => {
          let settled = false;
          const finish = () => { if (!settled) { settled = true; resolve(); } };
          const timer = setTimeout(finish, 100);
          requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); finish(); }));
        });
      }
      if (token !== request.current) return;
      const anchor = navigationAnchor(root, idx) ?? latest.current.items.filter(item => item.loaded && item.idx >= idx).map(item => navigationAnchor(root, item.idx)).find(Boolean);
      if (!anchor) throw new Error('Сообщение не найдено');
      setActive(idx);
      const top = root.scrollTop + anchor.getBoundingClientRect().top - root.getBoundingClientRect().top - 24;
      root.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      clearTimeout(landedTimer.current); landed.current?.removeAttribute('data-chat-nav-landed');
      landed.current = anchor; anchor.setAttribute('data-chat-nav-landed', '');
      landedTimer.current = setTimeout(() => { anchor.removeAttribute('data-chat-nav-landed'); pendingLanding.current = null; }, 1400);
    } catch (reason) { if (token === request.current) { setError(reason instanceof Error ? reason.message : String(reason)); pendingLanding.current = null; } }
    finally { if (token === request.current) setBusy(null); }
  }, [scrollRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); return; }
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      if (!slot.current || getComputedStyle(slot.current).display === 'none' || slot.current.getBoundingClientRect().width <= 900 || items.length < 2) return;
      const target = event.target;
      if (target instanceof HTMLSelectElement || ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.value !== '') || (target instanceof HTMLElement && target.isContentEditable && target.textContent?.trim())) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"],dialog[open]')) return;
      const now = Date.now();
      const previous = now - keyboard.current.at < 1200 ? items.findIndex(item => item.idx === keyboard.current.idx) : items.findIndex(item => item.idx === active);
      const next = event.key === 'ArrowDown' ? previous + 1 : previous - 1;
      if (next < 0 || next >= items.length) return;
      event.preventDefault(); keyboard.current = { idx: items[next].idx, at: now }; void navigate(items[next].idx);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [items, active, navigate]);

  if (items.length < 2) return null;
  const style = { '--chat-nav-height': `${visibleHeight}px` } as CSSProperties;
  return <div className="chat-navigation-slot" ref={slot} style={style}>
    <nav className="chat-navigation" aria-label="Навигация по сообщениям" data-open={open || undefined} onPointerEnter={() => { cancelClose(); setOpen(true); }} onPointerLeave={closeSoon} onFocus={() => { cancelClose(); setOpen(true); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) closeSoon(); }}>
      <button className="chat-navigation-trigger" type="button" aria-label="Показать навигацию по сообщениям" aria-expanded={open} onClick={() => setOpen(value => !value)} />
      <div className="chat-navigation-rail" aria-hidden="true" data-fade-top={offset > 0 || undefined} data-fade-bottom={offset < maxOffset || undefined}>
        <div className="chat-navigation-track" style={{ height: items.length * PITCH, transform: `translateY(${-offset}px)` }}>
          {items.map((item, index) => <span key={item.idx} className="chat-navigation-mark" style={{ top: index * PITCH }} data-unloaded={!item.loaded || undefined} data-current={item.idx === active || undefined} />)}
        </div>
      </div>
      <div className="chat-navigation-card" inert={!open} aria-hidden={!open}>
        <div className="chat-navigation-list" ref={list} onScroll={event => setOffset(event.currentTarget.scrollTop)}>
          {items.map((item, index) => <button key={item.idx} type="button" className="chat-navigation-row" aria-label={`Перейти к сообщению ${item.turn ?? index + 1}`} aria-current={item.idx === active ? 'true' : undefined} aria-busy={item.idx === busy || undefined} data-current={item.idx === active || undefined} data-unloaded={!item.loaded || undefined} onClick={() => { void navigate(item.idx); }}><span className="chat-navigation-text">{item.prompt || `Сообщение ${item.turn ?? index + 1}`}</span><span className="chat-navigation-dash" /></button>)}
        </div>
      </div>
    </nav>
    {error && <span className="chat-navigation-error" role="status">{error}</span>}
  </div>;
}
