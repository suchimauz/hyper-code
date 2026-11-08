import { useId, useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { useCommandMenu } from '../../hooks/useCommandMenu';
import { CommandMenu } from './CommandMenu';
import type { ComposerCommand } from '../../hooks/useCommandMenu';
import { CommandEditor, type CommandEditorHandle } from './CommandEditor';
import { IconButton } from '../ui/IconButton';
import { InputCaret } from './InputCaret';

export type MessageInputProps = {
  value: string; onChange: (value: string) => void; onSend: () => void;
  disabled?: boolean; sendDisabled?: boolean; running?: boolean; onStop?: () => void; onSteerAll?: () => void;
  commandMenuOpen?: boolean; onCommandMenuClose?: () => void; onFile?: () => void; onCompact?: () => void;
  placeholder?: string; hasAttachments?: boolean; attachments?: ReactNode; onFiles?: (files: File[]) => void; commandsEnabled?: boolean;
};
/** One-line controlled input; grows for wrapped lines, then scrolls at 180px. */
export function MessageInput({ commandMenuOpen, onCommandMenuClose, onFile, onCompact, value, onChange, onSend, disabled, sendDisabled = false, running, onStop, onSteerAll, hasAttachments = false, attachments, onFiles, commandsEnabled = false, placeholder = 'Напишите сообщение…' }: MessageInputProps) {
  const input = useRef<HTMLTextAreaElement>(null);
  const menuId = useId();
  const editor = useRef<CommandEditorHandle>(null);
  const [claimed, setClaimed] = useState<{ name: string } | null>(null);
  useLayoutEffect(() => { if (!value) setClaimed(null); }, [value]);
  // Touch: opening the + menu must not raise the on-screen keyboard.
  useLayoutEffect(() => { if (commandMenuOpen && !window.matchMedia?.('(pointer: coarse)').matches) editor.current?.focus(); }, [commandMenuOpen]);
  const activeClaim = claimed && value.startsWith(`/${claimed.name}`) ? claimed : null;
  const menu = useCommandMenu(value, commandsEnabled && !disabled, { plusOpen: commandMenuOpen, onClose: onCommandMenuClose, claimed: !!activeClaim, file: !!onFile, compact: !!onCompact, running });
  const pick = (command: ComposerCommand) => {
    if (command.disabled) return;
    const fromPlus = commandMenuOpen;
    menu.dismiss();
    if (command.name === 'file' || command.name === 'compact') {
      if (!fromPlus) onChange('');
      if (command.name === 'file') onFile?.(); else onCompact?.();
    } else { setClaimed({ name: command.name }); onChange(`/${command.name} ${fromPlus ? value.replace(/^\s*\/[^\s]*$/, '') : ''}`); }
    // Touch: attaching a file or compacting needs no keyboard; typed commands still focus the input.
    if ((command.name === 'file' || command.name === 'compact') && window.matchMedia?.('(pointer: coarse)').matches) return;
    editor.current?.focus(); input.current?.focus();
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && onSteerAll) { event.preventDefault(); if (!disabled) onSteerAll(); return; }
    if (menu.open) {
      if (event.key === 'Escape' || (event.key === 'Tab' && event.shiftKey)) { event.preventDefault(); menu.dismiss(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const count = menu.matches.length; if (count) menu.setIndex((menu.index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count); return; }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) { event.preventDefault(); if (menu.status === 'ready' && menu.matches[menu.index]) pick(menu.matches[menu.index]); return; }
      if (event.key === ' ') { const exact = menu.matches.find(c => value.trim() === `/${c.name}` && c.name !== 'file' && c.name !== 'compact'); if (exact) { event.preventDefault(); pick(exact); return; } }
    }
    if (event.key === 'Enter' && !event.shiftKey && !window.matchMedia('(pointer: coarse)').matches) { event.preventDefault(); if (!disabled && !sendDisabled && (value.trim() || hasAttachments)) onSend(); }
  };
  useLayoutEffect(() => {
    const el = input.current; if (!el) return;
    const fit = () => { el.style.height = '0px'; el.style.height = `${Math.max(24, Math.min(164, el.scrollHeight))}px`; el.style.overflowY = el.scrollHeight > 164 ? 'auto' : 'hidden'; };
    fit();
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => { if (el.clientWidth !== lastWidth) { lastWidth = el.clientWidth; fit(); } });
    observer.observe(el); return () => observer.disconnect();
  }, [value]);
  const stop = !!running && !value.trim() && !hasAttachments && !!onStop;
  return <form className="message-input" aria-label="Ввод сообщения" onSubmit={event => { event.preventDefault(); if (!disabled && !sendDisabled && (value.trim() || hasAttachments)) onSend(); }} aria-busy={disabled} onDragOver={event => { if (onFiles && !disabled && event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={event => { if (onFiles && event.dataTransfer.files.length) { event.preventDefault(); if (!disabled) onFiles(Array.from(event.dataTransfer.files)); } }}>
    {menu.open && <CommandMenu id={menuId} commands={menu.matches} index={menu.index} status={menu.status} error={menu.error} onPick={pick} onHover={menu.setIndex} onRetry={menu.retry} />}
    {attachments}
    {commandsEnabled ? <CommandEditor ref={editor} value={value} onChange={onChange} claimedCommand={activeClaim} onRelease={() => setClaimed(null)} disabled={disabled} placeholder={activeClaim?.name === 'plan' ? 'Опишите задачу для плана' : placeholder} onFiles={onFiles} onKeyDown={keyDown} aria-label="Сообщение агенту" aria-controls={menu.open ? menuId : undefined} aria-expanded={menu.open} aria-autocomplete="list" aria-haspopup="listbox" aria-activedescendant={menu.open && menu.status === 'ready' && menu.matches.length ? `${menuId}-${menu.index}` : undefined} onBlur={event => { if (!event.currentTarget.closest('.composer-readonly-boundary, .new-session-composer')?.contains(event.relatedTarget)) menu.dismiss(); }} /> : <textarea ref={input} aria-controls={menu.open ? menuId : undefined} aria-autocomplete={commandsEnabled ? 'list' : undefined} aria-haspopup={commandsEnabled ? 'listbox' : undefined} aria-activedescendant={menu.open && menu.status === 'ready' && menu.matches.length ? `${menuId}-${menu.index}` : undefined} aria-label="Сообщение агенту" placeholder={placeholder} rows={1} value={value} disabled={disabled} onPaste={event => { const files = Array.from(event.clipboardData.files); if (onFiles && files.length) { event.preventDefault(); if (!disabled) onFiles(files); } }} onChange={event => onChange(event.target.value)}
      onBlur={event => { if (!event.currentTarget.closest('form')?.contains(event.relatedTarget)) menu.dismiss(); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && onSteerAll) { event.preventDefault(); if (!disabled) onSteerAll(); return; }
        if (menu.open) {
          if (event.key === 'Escape') { event.preventDefault(); menu.dismiss(); return; }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const count = menu.matches.length; if (count) menu.setIndex((menu.index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count); return; }
          if ((event.key === 'Enter' && !event.shiftKey) || (event.key === 'Tab' && !event.shiftKey && menu.status === 'ready' && menu.matches.length)) { event.preventDefault(); if (menu.status === 'ready' && menu.matches[menu.index]) pick(menu.matches[menu.index]); return; }
        }
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !window.matchMedia('(pointer: coarse)').matches) { event.preventDefault(); if (!disabled && !sendDisabled && (value.trim() || hasAttachments)) onSend(); } }} />}
    {!commandsEnabled && <InputCaret input={input} value={value} />}
    <IconButton type={stop ? 'button' : 'submit'} className="message-input-send" label={stop ? 'Остановить выполнение' : running && !value.trim().startsWith('/') ? 'В очередь' : 'Отправить сообщение'} disabled={disabled || (!stop && (sendDisabled || (!value.trim() && !hasAttachments)))} onClick={stop ? onStop : undefined}>
      {stop ? <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="6" y="6" width="4" height="4" rx="1.2" fill="currentColor" /></svg> : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" aria-hidden="true"><path d="M8 3.75h5.25v7H3M6 7.75l-3 3 3 3" /></svg>}
    </IconButton>
  </form>;
}
