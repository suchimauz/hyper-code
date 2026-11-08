import type { CSSProperties } from 'react';
import { Archive, ArchiveRestore, Pin, PinOff } from 'lucide-react';
import { NavigationChatIcon } from './NavigationChatIcon';
import { NavigationTooltip } from './NavigationTooltip';
import { replyAge, type ChatAction, type NavigationChat } from '../../lib/navigation';

/** Separate sibling buttons avoid nested interactive elements and accidental chat selection. */
export function WorkspaceChatRow({ chat, selected, archivedView, pending, onSelect, onAction }: { chat: NavigationChat; selected: boolean; archivedView: boolean; pending?: boolean; onSelect: (id: string) => void; onAction?: (id: string, action: ChatAction) => void }) {
  const active = chat.runState === 'running' || chat.runState === 'claimed' || !!chat.teamRunningCount;
  return <div className={`workspace-chat-row ${selected ? 'is-selected' : ''} ${chat.pinned ? 'is-pinned' : ''} ${archivedView || chat.archived ? 'is-archived' : ''}`} aria-busy={pending || undefined}>
    <NavigationTooltip trigger={<button type="button" className={`workspace-chat ${selected ? 'is-selected' : ''}`} aria-current={selected ? 'page' : undefined} onClick={() => onSelect(chat.id)}>
      <NavigationChatIcon icon={chat.icon} active={active} />
      <span className={`workspace-chat-id ${chat.colorHue != null && Number.isFinite(chat.colorHue) ? 'has-agent-color' : ''}`} style={chat.colorHue != null && Number.isFinite(chat.colorHue) ? { '--agent-hue': chat.colorHue } as CSSProperties : undefined}>{chat.id}</span><span className={`workspace-chat-title ${chat.hasUnread ? 'is-unread' : ''}`}>{chat.title || 'Новый чат'}</span>
      {chat.pinned && !archivedView && <Pin className="workspace-pin-mark" size={10} strokeWidth={1} aria-label="Закреплён" />}
      <time dateTime={chat.lastReplyAt == null ? undefined : new Date(chat.lastReplyAt).toISOString()} title={chat.lastReplyAt == null ? 'Ответов ещё нет' : `Последний ответ: ${new Date(chat.lastReplyAt).toLocaleString('ru')}`}>{replyAge(chat.lastReplyAt)}</time>
    </button>}>
      <div className="navigation-tooltip-title">{chat.title || 'Новый чат'}</div>
      {chat.lastReplyAt != null && <div>{replyAge(chat.lastReplyAt) === 'now' ? 'Just now' : `${replyAge(chat.lastReplyAt)} ago`}</div>}
      {chat.model && <div>{chat.modelLabel || chat.model.split(':').at(-1)}{chat.effort?.label ? ` ${chat.effort.label}` : ''}</div>}
      <div className="navigation-tooltip-status"><span className="navigation-tooltip-dot" data-active={active} aria-hidden="true" />{chat.archived ? 'Archived' : active ? 'Running' : chat.runState === 'error' ? 'Error' : chat.runState === 'paused' ? 'Paused' : 'Idle'}</div>
    </NavigationTooltip>
    {onAction && <span className="workspace-chat-actions">
      {archivedView ? <button type="button" title="Разархивировать" aria-label={`Разархивировать чат ${chat.id}`} disabled={pending} onClick={() => onAction(chat.id, 'restore')}><ArchiveRestore size={14} strokeWidth={1} /></button> : <>
        <button type="button" title={active ? 'Дождитесь завершения работы' : 'Архивировать'} aria-label={`Архивировать чат ${chat.id}`} disabled={pending || active} onClick={() => onAction(chat.id, 'archive')}><Archive size={14} strokeWidth={1} /></button>
        <button type="button" title={chat.pinned ? 'Открепить' : 'Закрепить'} aria-label={`${chat.pinned ? 'Открепить' : 'Закрепить'} чат ${chat.id}`} aria-pressed={!!chat.pinned} disabled={pending} onClick={() => onAction(chat.id, chat.pinned ? 'unpin' : 'pin')}>{chat.pinned ? <PinOff size={14} strokeWidth={1} /> : <Pin size={14} strokeWidth={1} />}</button>
      </>}
    </span>}
  </div>;
}
