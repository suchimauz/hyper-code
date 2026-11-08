import type { ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import './tool-modal.css';
/** Mobile replacement for inline tool disclosures: details open in a centered dialog with a full-width thumb-reach close button at the bottom. */
export function ToolModal({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal><Dialog.Backdrop className="tool-modal-backdrop" /><Dialog.Popup className="tool-modal">
      <div className="tool-modal-header"><Dialog.Title className="tool-modal-title">{title}</Dialog.Title></div>
      <div className="tool-modal-body">{children}</div>
      <div className="tool-modal-footer"><Dialog.Close className="tool-modal-close">Закрыть</Dialog.Close></div>
    </Dialog.Popup></Dialog.Portal>
  </Dialog.Root>;
}
