import type { CSSProperties } from 'react';
import { NavigationChatIcon } from './NavigationChatIcon';
import { NavigationTooltip } from './NavigationTooltip';
import { replyAge } from '../../lib/navigation';
import type { HeaderChild } from '../../lib/chatHeader';

export function childTokens(value?: number | null) { return value == null ? '— tok' : `${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} tok`; }
export function childDuration(value?: number | null) {
  if (value == null) return '—';
  const seconds = Math.floor(value / 1000), minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
/** Shared navigation tooltip and identity, with measured usage rather than age-based duration. */
export function HeaderChildRow({ child, onSelect, onOpenSide }: { child: HeaderChild; onSelect: (id: string) => void; onOpenSide?: () => void }) {
  const active = child.runState === 'running' || child.runState === 'claimed';
  return <div className="chat-header-child-row"><NavigationTooltip trigger={<button type="button" className="chat-header-child" onClick={() => onSelect(child.id)}>
    <NavigationChatIcon icon={child.icon} active={active} />
    <span className={`workspace-chat-id ${child.colorHue != null ? 'has-agent-color' : ''}`} style={child.colorHue != null ? { '--agent-hue': child.colorHue } as CSSProperties : undefined}>{child.id}</span>
    <span className="chat-header-child-title">{child.title || child.id}</span>
    <span className="chat-header-child-metrics"><span>{childTokens(child.tokens)}</span><span title="Общее время выполнения">{childDuration(child.durationMs)}</span></span>
  </button>}>
    <div className="navigation-tooltip-title">{child.title || child.id}</div>
    {child.lastReplyAt != null && <div>{replyAge(child.lastReplyAt) === 'now' ? 'Just now' : `${replyAge(child.lastReplyAt)} ago`}</div>}
    {child.modelLabel && <div>{child.modelLabel}</div>}
    <div className="navigation-tooltip-status"><span className="navigation-tooltip-dot" data-active={active} aria-hidden="true" />{active ? 'Running' : child.runState === 'error' ? 'Error' : child.runState === 'paused' ? 'Paused' : 'Idle'}</div>
  </NavigationTooltip>{onOpenSide && <button type="button" className="chat-header-child-side" aria-label={`Открыть ${child.title} в боковой панели`} onClick={onOpenSide}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 12L9.29289 8.70711C9.68342 8.31658 9.68342 7.68342 9.29289 7.29289L6 4" stroke="currentColor" strokeWidth="1" /></svg></button>}</div>;
}
