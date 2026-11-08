import type { ReactElement, ReactNode, RefObject } from 'react';
import { Menu } from '@base-ui/react/menu';
import './floating.css';
export type ActionGroup = { label: string; items: { label: string; description?: string; icon?: ReactNode; disabled?: boolean; onSelect: () => void }[] };
/** Grouped menu anchored to a full input surface, not the small trigger button. */
export function ActionMenu({ trigger, groups, anchor }: { trigger: ReactElement; groups: ActionGroup[]; anchor?: RefObject<Element | null> }) {
  return <Menu.Root><Menu.Trigger render={trigger} />
    <Menu.Portal><Menu.Positioner anchor={anchor} side="top" align="start" sideOffset={4} collisionPadding={12} className="floating-positioner">
      <Menu.Popup className="ui-action-menu" data-wide={!!anchor || undefined}>
        <div className="ui-menu-material" aria-hidden="true" />
        <div className="ui-menu-content">{groups.map(group => <Menu.Group key={group.label}>
          <Menu.GroupLabel className="ui-menu-label">{group.label}</Menu.GroupLabel>
          {group.items.map(item => <Menu.Item key={item.label} className="ui-menu-item" disabled={item.disabled} onClick={item.onSelect}>{item.icon}<span>{item.label}</span>{item.description && <span className="ui-menu-description">{item.description}</span>}</Menu.Item>)}
        </Menu.Group>)}</div>
      </Menu.Popup>
    </Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
