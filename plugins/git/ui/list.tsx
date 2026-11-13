import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { moveIndex } from './model';

export type ListSection<T> = { id: string; label?: ReactNode; items: T[] };
type Props<T> = {
  label: string;
  sections: ListSection<T>[];
  itemKey: (item: T) => string;
  selectedKey: string | null;
  onPick: (item: T) => void;
  render: (item: T, selected: boolean) => ReactNode;
  className?: string;
  empty?: ReactNode;
  /** Items shown only for an exit transition: hidden from assistive tech, never focusable or pickable. */
  ghost?: (item: T) => boolean;
};
/** Single-select listbox with grouped options and roving focus (Arrow/Home/End, Enter/Space picks). */
export function ListBox<T>({ label, sections, itemKey, selectedKey, onPick, render, className = '', empty, ghost }: Props<T>) {
  const isGhost = (item: T) => !!ghost?.(item);
  const all = sections.flatMap(s => s.items);
  const flat = all.filter(item => !isGhost(item));
  const keys = flat.map(itemKey);
  const selectedIndex = selectedKey === null ? -1 : keys.indexOf(selectedKey);
  const [active, setActive] = useState(Math.max(0, selectedIndex));
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  // Follow the authoritative selection after refresh; clamp when the list shrinks.
  useEffect(() => { setActive(a => selectedIndex >= 0 ? selectedIndex : Math.min(a, Math.max(0, flat.length - 1))); }, [selectedIndex, flat.length]);
  if (!all.length) return <>{empty}</>;
  const onKey = (e: KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(flat[index]); return; }
    const next = moveIndex(e.key, index, flat.length, false);
    if (next === null) return;
    e.preventDefault(); setActive(next); refs.current[next]?.focus();
  };
  let index = 0;
  return <ul role="listbox" aria-label={label} className={'git-list ' + className}>
    {sections.map(section => {
      const options = section.items.map(item => {
        if (isGhost(item)) return <li key={itemKey(item)} role="presentation" aria-hidden="true" className="git-option git-ghost">{render(item, false)}</li>;
        const i = index++, key = keys[i], selected = key === selectedKey;
        return <li key={key} role="option" aria-selected={selected} tabIndex={i === active ? 0 : -1} className="git-option"
          ref={el => { refs.current[i] = el; }} onClick={() => { setActive(i); onPick(item); }} onKeyDown={e => onKey(e, i)} onFocus={() => setActive(i)}>
          {render(item, selected)}
        </li>;
      });
      if (section.label === undefined) return options;
      return <li key={'g:' + section.id} role="presentation" className="git-group">
        <div className="git-group-label" id={'git-group-' + section.id} aria-hidden="true">{section.label}</div>
        <ul role="group" aria-labelledby={'git-group-' + section.id}>{options}</ul>
      </li>;
    })}
  </ul>;
}
