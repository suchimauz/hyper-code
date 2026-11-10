import { useEffect, useRef } from 'react';
import './WaitLoader.css';

// Choreography ported from dsh-claude-style's MIT chat-wait implementation.
// This uses browser CSS/WAAPI only, not its Sodium rendering engine.
const modes = ['bounce', 'line', 'orbit'] as const;
type Mode = typeof modes[number];
type Motion = { animation: Animation; turn: number; alternate: boolean; active: number };
const handoverId = 'wait-loader-handover';
const harmonic = 'cubic-bezier(.37, 0, .63, 1)';
const lanes = { bounce: { arrives: [1], leaves: [1], fade: .5 }, line: { arrives: [.25, .75], leaves: [0, .5], fade: .25 }, orbit: { arrives: [0], leaves: [.2083, .4583, .7083, .9583], fade: .125 } };

function motion(dot: HTMLElement): Motion | null {
  if (typeof CSSAnimation === 'undefined') return null;
  const animation = dot.getAnimations().find(a => a instanceof CSSAnimation);
  if (!animation?.effect || animation.currentTime === null) return null;
  const timing = animation.effect.getTiming();
  const turn = Number(timing.duration);
  const active = Number(animation.currentTime) - Number(timing.delay);
  if (!Number.isFinite(turn) || turn <= 0 || !Number.isFinite(active)) return null;
  return { animation, turn, alternate: timing.direction === 'alternate', active };
}

function until(m: Motion, phases: number[]) {
  for (let delay = 0; delay <= m.turn * (m.alternate ? 2 : 1); delay++) {
    const cycle = Math.floor((m.active + delay) / m.turn);
    const fraction = (m.active + delay - cycle * m.turn) / m.turn;
    const phase = m.alternate && cycle % 2 === 1 ? 1 - fraction : fraction;
    if (phases.some(p => Math.abs(phase - p) <= 1 / m.turn)) return delay;
  }
  throw new Error('WaitLoader: stationary phase is unreachable');
}

function sample(dot: HTMLElement, m: Motion, delay: number) {
  const time = m.animation.currentTime;
  m.animation.currentTime = Number(time) + delay;
  const style = getComputedStyle(dot);
  const translate = style.translate === 'none' ? [] : style.translate.split(' ').map(parseFloat);
  const scale = style.scale === 'none' ? [] : style.scale.split(' ').map(parseFloat);
  m.animation.currentTime = time;
  const originX = dot.offsetLeft + dot.offsetWidth / 2;
  const originY = dot.offsetTop + dot.offsetHeight;
  return { x: originX + (translate[0] ?? 0), y: originY + (translate[1] ?? 0), originX, originY, scaleX: scale[0] ?? 1, scaleY: scale[1] ?? scale[0] ?? 1 };
}

/** Exhaustive minimum-distance surjection preserves all dots during 3↔4 morphs. */
function matchDots(from: number, to: number, cost: (a: number, b: number) => number) {
  const large = Math.max(from, to), small = Math.min(from, to);
  let best: [number, number][] = [], minimum = Infinity;
  for (let candidate = 0; candidate < small ** large; candidate++) {
    const pairs: [number, number][] = [], covered = new Set<number>();
    for (let i = 0, value = candidate; i < large; i++, value = Math.floor(value / small)) {
      const j = value % small;
      covered.add(j); pairs.push(from >= to ? [i, j] : [j, i]);
    }
    if (covered.size < small) continue;
    const distance = pairs.reduce((sum, [a, b]) => sum + cost(a, b), 0);
    if (distance < minimum) { minimum = distance; best = pairs; }
  }
  return best;
}

function startLoader(root: HTMLSpanElement) {
  let stopped = false, generation = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current: Mode = modes[Math.floor(Math.random() * modes.length)];
  const dots = (mode: Mode) => Array.from(root.querySelectorAll<HTMLElement>(`.is-${mode} .wait-loader-dot`));
  const show = (active: Mode, leaving: Mode | null = null) => {
    for (const mode of modes) {
      const lane = root.querySelector(`.is-${mode}`)!;
      lane.classList.toggle('is-active', mode === active);
      lane.classList.toggle('is-leaving', mode === leaving);
      lane.classList.toggle('is-resting', mode !== active && mode !== leaving);
    }
  };
  const cancelHandovers = () => {
    root.querySelectorAll<HTMLElement>('.wait-loader-dot').forEach(dot => dot.getAnimations().forEach(a => { if (a.id === handoverId) a.cancel(); }));
  };
  const animate = (dot: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions, start: number) => {
    const animation = dot.animate(frames, { ...options, id: handoverId });
    animation.startTime = start;
    return animation;
  };
  const visibility = (dot: HTMLElement, visible: boolean, delay: number, start: number) => animate(dot, [{ opacity: visible ? 0 : 1 }, { opacity: visible ? 1 : 0 }], { duration: 0, delay, fill: 'both' }, start);
  const readMotions = (list: HTMLElement[]): Motion[] | null => {
    const values = list.map(motion);
    return values.every((value): value is Motion => value !== null) ? values : null;
  };
  const synchronize = (list: HTMLElement[], start: number) => {
    const values = readMotions(list);
    if (!values) return null;
    values.forEach(m => { m.animation.startTime = start; });
    return readMotions(list);
  };
  const fallback = () => {
    clearTimeout(timer); generation++;
    cancelHandovers();
    current = 'bounce'; show(current);
    root.setAttribute('data-static', '');
  };
  // Decorative motion must never escape an effect or a timer and break the chat.
  const safely = (action: () => void) => {
    try { action(); } catch (error) {
      fallback();
      console.warn('WaitLoader: using static dots after animation failure', error);
    }
  };
  const enter = () => {
    show(current);
    if (preference.matches) return;
    const start = Number(document.timeline.currentTime), list = dots(current), motions = synchronize(list, start);
    if (!motions) { fallback(); return; }
    list.forEach((dot, i) => animate(dot, [{ opacity: 0 }, { opacity: 1 }], { duration: motions[i].turn * lanes[current].fade, delay: until(motions[i], lanes[current].arrives), easing: current === 'bounce' ? 'cubic-bezier(.32, 0, .67, 0)' : 'cubic-bezier(.33, 1, .68, 1)', fill: 'both' }, start));
  };
  const morph = (next: Mode) => {
    cancelHandovers();
    const token = ++generation, previous = current;
    current = next;
    const start = Number(document.timeline.currentTime), duration = 480;
    const outgoing = dots(previous), motions = readMotions(outgoing);
    if (!motions) { fallback(); return; }
    const delays = motions.map(m => until(m, lanes[previous].leaves));
    const positions = outgoing.map((dot, i) => sample(dot, motions[i], delays[i]));
    show(next, previous);
    const incoming = dots(next), nextMotions = synchronize(incoming, start);
    if (!nextMotions) { fallback(); return; }
    const pairs = matchDots(outgoing.length, incoming.length, (a, b) => {
      const p = sample(incoming[b], nextMotions[b], delays[a]);
      return Math.hypot(p.x - positions[a].x, p.y - positions[a].y);
    });
    const sources = incoming.map((_, i) => pairs.filter(pair => pair[1] === i).map(pair => pair[0]).reduce((a, b) => delays[b] < delays[a] ? b : a));
    const animations: Animation[] = [];
    outgoing.forEach((dot, i) => {
      if (sources.includes(i)) { animations.push(visibility(dot, false, delays[i], start)); return; }
      const target = pairs.find(pair => pair[0] === i)![1];
      const end = sample(incoming[target], nextMotions[target], delays[i] + duration), p = positions[i];
      animations.push(animate(dot, [{ translate: `${p.x - p.originX}px ${p.y - p.originY}px`, scale: `${p.scaleX} ${p.scaleY}` }, { translate: `${end.x - p.originX}px ${end.y - p.originY}px`, scale: `${end.scaleX} ${end.scaleY}` }], { duration, delay: delays[i], easing: harmonic, fill: 'forwards' }, start), visibility(dot, false, delays[i] + duration, start));
    });
    incoming.forEach((dot, i) => {
      const source = sources[i], delay = delays[source], p = positions[source];
      const begin = sample(dot, nextMotions[i], delay), end = sample(dot, nextMotions[i], delay + duration);
      animations.push(visibility(dot, true, delay, start), animate(dot, [{ translate: `${p.x - begin.x}px ${p.y - begin.y}px` }, { translate: '0px 0px' }], { duration, delay, easing: harmonic, composite: 'add' }, start), animate(dot, [{ scale: `${p.scaleX} ${p.scaleY}` }, { scale: `${end.scaleX} ${end.scaleY}` }], { duration, delay, easing: harmonic }, start));
    });
    void Promise.allSettled(animations.map(a => a.finished)).then(() => {
      if (stopped || generation !== token) return;
      show(next); cancelHandovers();
    });
  };
  const schedule = () => {
    if (preference.matches || stopped || root.hasAttribute('data-static')) return;
    timer = setTimeout(() => safely(() => { const choices = modes.filter(mode => mode !== current); morph(choices[Math.floor(Math.random() * choices.length)]); schedule(); }), 10000);
  };
  const change = () => {
    clearTimeout(timer); generation++; cancelHandovers();
    root.toggleAttribute('data-reduced-motion', preference.matches);
    root.removeAttribute('data-static');
    safely(() => { enter(); schedule(); });
  };
  preference.addEventListener('change', change);
  change();
  return () => {
    stopped = true; generation++; clearTimeout(timer); preference.removeEventListener('change', change);
    // CSS animations belong to the stylesheet, not this effect. Cancelling them
    // breaks React StrictMode's setup → cleanup → setup on the same DOM nodes.
    cancelHandovers();
  };
}

/** Original three-mode waiting dots with phase-aware morphs; decorative only. */
export function WaitLoader() {
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // Non-animation DOMs (SSR tests) retain static dots rather than fake motion.
    if (!root.current) return;
    if (typeof root.current.animate !== 'function' || typeof root.current.getAnimations !== 'function' || typeof window.matchMedia !== 'function') {
      root.current.setAttribute('data-static', '');
      return;
    }
    return startLoader(root.current);
  }, []);
  return <span ref={root} className="wait-loader" aria-hidden="true">{modes.map((mode, index) => <span key={mode} className={`wait-loader-lane is-${mode} ${index === 0 ? 'is-active' : 'is-resting'}`}>{Array.from({ length: mode === 'orbit' ? 4 : 3 }, (_, i) => <span key={i} className="wait-loader-dot" />)}</span>)}</span>;
}
