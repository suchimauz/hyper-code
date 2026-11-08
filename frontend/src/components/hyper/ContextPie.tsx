import { useId } from 'react';
/** dsh-claude contextPieImage geometry, MIT © 2026 Nwflower (public/mascot/crab/LICENSE). */
export function ContextPie({ percent }: { percent: number | null }) {
  const id = useId().replace(/:/g, '');
  const p = Math.max(0, Math.min(100, percent ?? 0));
  const round = (n: number) => Math.round(n * 100) / 100;
  const sector = (radius: number, start: number, end: number) => {
    const point = (angle: number) => `${round(8 + radius * Math.sin(angle / 180 * Math.PI))} ${round(8 - radius * Math.cos(angle / 180 * Math.PI))}`;
    return `M 8 8 L ${point(start)} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end)} Z`;
  };
  const inset = 1.3 * Math.min(1, Math.abs(p - 50) / 35);
  const used = sector(p <= 50 ? 8 : 8 - inset, 0, p * 3.6);
  const rest = sector(p <= 50 ? 8 - inset : 8, p * 3.6, 360);
  const greyGap = 1.2 * (100 - p) / 100;
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    {p === 0 || p === 100 ? <circle cx="8" cy="8" r="8" fill={p === 100 ? 'currentColor' : 'var(--context-rest)'} /> : <>
      <defs>{[{ key: 'grey', path: used, gap: greyGap }, { key: 'color', path: rest, gap: 1.2 - greyGap }].map(mask => <mask key={mask.key} id={`${id}-${mask.key}`} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16"><rect width="16" height="16" fill="white" /><path d={mask.path} fill="none" stroke="black" strokeWidth={round(mask.gap * 2)} strokeLinejoin="round" /></mask>)}</defs>
      {p <= 50 ? <><path d={rest} fill="var(--context-rest)" mask={`url(#${id}-grey)`} /><path d={used} fill="currentColor" mask={`url(#${id}-color)`} /></> : <><path d={used} fill="currentColor" mask={`url(#${id}-color)`} /><path d={rest} fill="var(--context-rest)" mask={`url(#${id}-grey)`} /></>}
    </>}
  </svg>;
}
