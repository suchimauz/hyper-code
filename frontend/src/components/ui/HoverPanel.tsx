import type { ReactElement, ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';
import './floating.css';
/** Detailed hover card: also opens by click/keyboard, stays open while exploring its content. */
export function HoverPanel({ trigger, children, label, className = '', open, onOpenChange, id }: { trigger: ReactElement; children: ReactNode; label: string; className?: string; open?: boolean; onOpenChange?: (open: boolean) => void; id?: string }) {
  return <Popover.Root open={open} onOpenChange={onOpenChange}><Popover.Trigger render={trigger} openOnHover delay={200} closeDelay={150} />
    <Popover.Portal><Popover.Positioner side="top" align="end" sideOffset={8} collisionPadding={12} className="floating-positioner">
      <Popover.Popup id={id} className={`ui-hover-panel ${className}`} aria-label={label}>{children}</Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
