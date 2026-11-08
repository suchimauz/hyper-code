import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { EventPage } from '../../lib/hyper';
import './open-pet-mascot.css';
export const openPetNames = { bitty: 'Bitty', tmuxai: 'TmuxAI', planet: 'Planet', 'rainbow-terminal-cat': 'Rainbow Terminal Cat' } as const;
export type OpenPet = keyof typeof openPetNames;
// OpenPets pet-format animation.ts, c8dfeb661ee60e9c0f270316dd4e0f9c9158eb3d.
// Artwork provenance and rights notices live alongside each local sprite sheet.
// Idle uses a 1.8s loop instead of upstream 5.5s: no nearly one-second frozen frames.
// Preserve discrete frames (linear interpolation would slide across unrelated cells).
const animations = { idle: [0, 6, 1800], waving: [3, 4, 700], jumping: [4, 5, 840], failed: [5, 8, 1220], waiting: [6, 6, 1010], running: [7, 6, 820], review: [8, 6, 1030] } as const;
type State = keyof typeof animations;
export function OpenPetMascot({ page, pet }: { page: EventPage | null; pet: OpenPet }) {
  const strip = useRef<HTMLSpanElement>(null);
  const [reaction, setReaction] = useState<State | null>(null);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const running = !!(page?.isRunning || page?.thinking || page?.activeTools?.length);
  const previous = useRef(running);
  const state: State = reaction ?? (page?.lastError ? 'failed' : page?.activeTools?.length ? 'running' : page?.thinking ? 'review' : running ? 'waiting' : 'idle');
  const [row, frames, duration] = animations[state];
  useEffect(() => { const m = matchMedia('(prefers-reduced-motion: reduce)'); const change = () => setReduced(m.matches); m.addEventListener('change', change); return () => m.removeEventListener('change', change); }, []);
  useEffect(() => { if (previous.current && !running) setReaction(page?.lastError ? 'failed' : 'jumping'); previous.current = running; }, [running, page?.lastError]);
  useEffect(() => { if (!reaction) return; const timer = setTimeout(() => setReaction(null), animations[reaction][2] * 2); return () => clearTimeout(timer); }, [reaction]);
  useEffect(() => {
    const el = strip.current; if (!el) return;
    const transform = (i: number) => `translate(${-i * 72}px, ${-row * 78}px)`;
    el.style.transform = transform(0);
    if (reduced) return;
    const keyframes = Array.from({ length: frames + 1 }, (_, i) => ({ offset: i / frames, transform: transform(i % frames), easing: 'steps(1)' }));
    const animation = el.animate(keyframes, { duration, iterations: reaction ? 2 : Infinity });
    return () => animation.cancel();
  }, [row, frames, duration, reduced, reaction]);
  const style = { '--open-pet-sheet': `url("${import.meta.env.BASE_URL}mascot/${pet}/spritesheet.webp")` } as CSSProperties;
  return <div className="open-pet-mascot" data-pet={pet} data-animation={state} style={style}>
    <span className="open-pet-window" aria-hidden="true"><span ref={strip} className="open-pet-strip" /></span>
    <button className="open-pet-hit" type="button" aria-label={`Поиграть с ${openPetNames[pet]}`} disabled={running} onClick={() => setReaction(current => current === 'waving' ? 'jumping' : 'waving')} />
  </div>;
}
