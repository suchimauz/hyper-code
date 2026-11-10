import { Plus } from 'lucide-react';
import './composer-footer.css';

/** Shared attachment/command menu trigger for both new and existing chats. */
export function ComposerAddButton({ open, disabled, onClick }: { open: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" className="composer-add" aria-label="Добавить" title="Добавить файл или выполнить команду" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={onClick}><Plus size={18} strokeWidth={1.5} /></button>;
}
