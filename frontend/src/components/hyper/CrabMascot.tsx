import { useEffect, useRef, useState, type CSSProperties } from 'react';
import crab from './crab-sheets.json';
import deepy from './deepy-sheets.json';
import whalegirl from './whalegirl-sheets.json';
import type { EventPage } from '../../lib/hyper';
import './crab-mascot.css';
import { OpenPetMascot, openPetNames, type OpenPet } from './OpenPetMascot';
import { DeskSpriteMascot } from './DeskSpriteMascot';
type State = keyof typeof crab | 'idle-spout';
type Sheet = { frames: number; box: number[]; still: number; columns?: number; durs?: number[] };
const catalog: Record<'crab' | 'deepy' | 'whalegirl', Record<string, Sheet>> = { crab, deepy, whalegirl };
/** Original dsh-claude sprites; see public/mascot/NOTICE.md and LICENSE. */
export function CrabMascot({ page }: { page: EventPage | null }) {
  if (page?.mascot === 'desksprite') return <DeskSpriteMascot page={page} />;
  if (page?.mascot && page.mascot in openPetNames) return <OpenPetMascot key={`${page.agentId}:${page.mascot}`} page={page} pet={page.mascot as OpenPet} />;
  const pet = page?.mascot && page.mascot in catalog ? page.mascot as keyof typeof catalog : 'crab';
  return <AnimatedPet key={`${page?.agentId ?? 'new'}:${pet}`} page={page} pet={pet} />;
}
function AnimatedPet({ page, pet }: { page: EventPage | null; pet: keyof typeof catalog }) {
  const sheets = catalog[pet];
  const frameMs = pet === 'deepy' ? 50 : 80;
  const gutter = pet === 'whalegirl' ? 0 : 1;
  const extras: State[] = pet === 'crab' ? ['idle-look', 'idle-wave', 'idle-laptop'] : ['idle-look', 'idle-spout'];
  const [reaction, setReaction] = useState<State | null>(null);
  const [idle, setIdle] = useState<State>('idle');
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const strip = useRef<HTMLSpanElement>(null);
  const quietSince = useRef(Date.now());
  const wasRunning = useRef(false);
  const press = useRef<{ x: number; y: number } | null>(null);
  const run = page?.activeTools?.[0];
  const base: State = page?.lastError ? 'error' : run ? (/bash|write|edit/.test(run.name) ? 'building' : 'typing') : page?.thinking ? 'thinking' : page?.isRunning ? 'typing' : idle;
  const state = reaction || base;
  const sheet = sheets[state];
  const columns = sheet.columns ?? 8;
  const cellWidth = sheet.box[2] + gutter * 2, cellHeight = sheet.box[3] + gutter * 2;
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const change = () => setReduced(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  useEffect(() => {
    if (wasRunning.current && !page?.isRunning) { setReaction(page?.lastError ? 'error' : 'happy'); quietSince.current = Date.now(); }
    wasRunning.current = !!page?.isRunning;
    if (page?.isRunning) { setIdle('idle'); quietSince.current = Date.now(); }
  }, [page?.isRunning, page?.lastError]);
  useEffect(() => {
    if (!reaction || reaction === 'drag') return;
    const timer = setTimeout(() => setReaction(null), sheets[reaction].durs?.reduce((a, b) => a + b, 0) ?? sheets[reaction].frames * frameMs);
    return () => clearTimeout(timer);
  }, [reaction, sheets, frameMs]);
  useEffect(() => {
    if (page?.isRunning || reduced) return;
    const timer = setInterval(() => {
      const elapsed = Date.now() - quietSince.current;
      if (elapsed >= 60000) setIdle('sleeping');
      else if (elapsed >= 20000) setReaction(current => current || extras[Math.floor(Math.random() * extras.length)]);
    }, 20000);
    return () => clearInterval(timer);
  }, [page?.isRunning, reduced]);
  useEffect(() => {
    const el = strip.current; if (!el) return;
    const transform = (frame: number) => `translate(${-((frame % columns) * cellWidth + gutter) * 2}px, ${-(Math.floor(frame / columns) * cellHeight + gutter) * 2}px)`;
    if (reduced && !reaction) { el.style.transform = transform(sheet.still); return; }
    const duration = sheet.durs?.reduce((a, b) => a + b, 0) ?? sheet.frames * frameMs;
    let elapsed = 0;
    const frames = Array.from({ length: sheet.frames }, (_, i) => {
      const frame = { offset: elapsed / duration, transform: transform(i), easing: 'steps(1)' };
      elapsed += sheet.durs?.[i] ?? frameMs;
      return frame;
    });
    frames.push({ offset: 1, transform: transform(reaction ? sheet.frames - 1 : 0), easing: 'steps(1)' });
    const animation = el.animate(frames, { duration, iterations: reaction && reaction !== 'drag' ? 1 : Infinity, fill: 'forwards' });
    return () => animation.cancel();
  }, [state, reduced, reaction, sheet, columns, cellWidth, cellHeight, gutter, frameMs]);
  const url = `${import.meta.env.BASE_URL}mascot/${pet}/${state}`;
  const style = { '--crab-width': `${sheet.box[2] * 2}px`, '--crab-height': `${sheet.box[3] * 2}px`, '--crab-left': `${sheet.box[0] * 2}px`, '--crab-top': `${sheet.box[1] * 2}px`, '--crab-sheet-width': `${cellWidth * columns * 2}px`, '--crab-sheet-height': `${cellHeight * Math.ceil(sheet.frames / columns) * 2}px`, '--crab-body': `url("${url}${pet === 'crab' ? '-body.png' : pet === 'deepy' ? '.svg' : '.png'}")`, '--crab-ink': pet === 'crab' ? `url("${url}-ink.png")` : 'none' } as CSSProperties;
  return <div className="crab-mascot" style={style} data-pet={pet} data-animation={state}>
    <span className="crab-window" aria-hidden="true"><span ref={strip} className="crab-strip" /></span>
    <button type="button" className="crab-hit" aria-label={`Поиграть с ${pet === 'crab' ? 'крабом' : pet === 'deepy' ? 'Deepy' : 'Whalegirl'}`} disabled={!!page?.isRunning}
      onPointerDown={e => { if (e.button !== 0) return; press.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) setReaction('drag'); }}
      onPointerUp={e => { const start = press.current; press.current = null; quietSince.current = Date.now(); setIdle('idle'); setReaction(reaction === 'drag' ? 'happy' : idle === 'sleeping' ? 'waking' : start && e.clientX < e.currentTarget.getBoundingClientRect().left + 24 ? 'poke-left' : 'poke-right'); }}
      onPointerCancel={() => { press.current = null; setReaction(null); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); quietSince.current = Date.now(); setIdle('idle'); setReaction(idle === 'sleeping' ? 'waking' : 'tickle'); } }} />
  </div>;
}
