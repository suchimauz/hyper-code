import { Menu } from '@base-ui/react/menu';
import { Check, Ellipsis, Puzzle, type LucideIcon } from 'lucide-react';

export type WorkspaceMoreItem = { key: string; title: string; active: boolean; onSelect: () => void; icon?: LucideIcon };

/** Secondary sidebar destinations (plugin pages; on phones also Plugins, Pages, Cron Tasks) collapsed behind one "More" menu so the pinned actions stay short. */
export function WorkspaceMoreMenu({ items, compact = false }: { items: readonly WorkspaceMoreItem[]; compact?: boolean }) {
  if (!items.length) return null;
  const active = items.some(item => item.active);
  return <Menu.Root>
    <Menu.Trigger className={`workspace-action ${active ? 'is-selected' : ''}`} aria-label="More" title="More"><Ellipsis size={16} strokeWidth={1} />{!compact && <span>More</span>}</Menu.Trigger>
    <Menu.Portal><Menu.Positioner side={compact ? 'right' : 'bottom'} align="start" sideOffset={4} collisionPadding={12} className="floating-positioner">
      <Menu.Popup className="workspace-view-menu workspace-more-menu" aria-label="More">
        {items.map(item => <Menu.Item key={item.key} className="workspace-menu-item" aria-current={item.active ? 'page' : undefined} onClick={item.onSelect}>{(() => { const Icon = item.icon ?? Puzzle; return <Icon size={14} strokeWidth={1} />; })()}<span>{item.title}</span>{item.active && <span><Check size={14} strokeWidth={1} /></span>}</Menu.Item>)}
      </Menu.Popup>
    </Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
