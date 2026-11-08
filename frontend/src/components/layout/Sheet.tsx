import type { ReactNode } from 'react';
import { Drawer } from '@base-ui/react/drawer';
import { X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
export type SheetProps = { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode; hideHeader?: boolean; initialFocus?: React.RefObject<HTMLElement | null>; swipeToOpen?: boolean };
/**
 * Modal mobile navigation drawer sliding in from the left. Base UI owns focus trapping, Escape,
 * focus restoration and swipe gestures: swipe left on the panel to dismiss it, and, with
 * `swipeToOpen`, swipe right from the left screen edge to open it.
 */
export function Sheet({ open, onOpenChange, title, children, hideHeader = false, initialFocus, swipeToOpen = false }: SheetProps) {
  return <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="left">
    {swipeToOpen && <Drawer.SwipeArea className="sheet-swipe-area" />}
    <Drawer.Portal><Drawer.Backdrop className="sheet-backdrop" /><Drawer.Viewport className="sheet-viewport"><Drawer.Popup className="sheet" initialFocus={initialFocus}>
      {hideHeader ? <Drawer.Title className="sr-only">{title}</Drawer.Title> : <div className="sheet-title"><Drawer.Title>{title}</Drawer.Title><IconButton label="Закрыть навигацию" onClick={() => onOpenChange(false)}><X size={18} /></IconButton></div>}
      <Drawer.Description className="sr-only">Выберите агента для открытия чата.</Drawer.Description>{children}
    </Drawer.Popup></Drawer.Viewport></Drawer.Portal>
  </Drawer.Root>;
}
