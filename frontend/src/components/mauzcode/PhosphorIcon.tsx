import { Puzzle } from 'lucide-react';
import { usePhosphorFont } from './usePhosphorFont';
import './phosphor-icon.css';

/** A bare plugin icon glyph of `size` pixels; falls back to a puzzle when the icon is missing or unavailable. */
export function PhosphorIcon({ icon, size, strokeWidth = 1.5, fallbackSize = size }: { icon?: string | null; size: number; strokeWidth?: number; /** Puzzle fallback size. @default size */ fallbackSize?: number }) {
  const cls = usePhosphorFont(icon);
  return <span className="phosphor-icon" aria-hidden="true" style={{ width: size, height: size, fontSize: size }}>
    {cls ? <i className={`ph ${cls}`} /> : <Puzzle size={fallbackSize} strokeWidth={strokeWidth} />}
  </span>;
}
