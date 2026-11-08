import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { NavigationChatIcon } from './NavigationChatIcon';
import type { NavigationIcon } from '../../lib/navigation';
import { Popover } from '@base-ui/react/popover';
import { ChevronDown, Menu, PanelRight } from 'lucide-react';
import { HeaderChildRow } from './HeaderChildRow';
import { getChatHeader, renameChat, type ChatHeaderData } from '../../lib/chatHeader';
import { liveRefresh } from '../../lib/liveRefresh';
import './chat-header.css';

/** Native session title and direct team children; editing never navigates away from the chat. */
export function ChatHeader({ agentId, title, icon, colorHue, active, archived, canvasOpen, canvasDisabled, onCanvas, onSelect, onRenamed, onOpenSide, widthControlRef, onMenu }: { onMenu?: () => void;  agentId: string; title: string; icon?: NavigationIcon | null; colorHue?: number | null; active?: boolean; archived?: boolean; canvasOpen: boolean; canvasDisabled?: boolean; onCanvas: () => void; onSelect: (id: string) => void; onRenamed: () => void; widthControlRef?: (node: HTMLSpanElement | null) => void; onOpenSide?: (id: string, title: string) => void }) {
  const [data, setData] = useState<ChatHeaderData | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const titleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const cancelled = useRef(false);
  const refresh = useRef(() => {});
  const mutation = useRef(0);
  useEffect(() => {
    if (!agentId) return;
    const live = liveRefresh({ name: `chat-header:${agentId}`, fallbackMs: 5000, matches: e => !e.topic || e.topic === 'agents' || e.topic === `agent:${agentId}`, read: async signal => {
      const version = mutation.current;
      try { const result = await getChatHeader(agentId, signal); if (!signal.aborted && version === mutation.current) { setData(result); setError(''); } }
      catch (err) { if (!signal.aborted) setError(err instanceof Error ? err.message : String(err)); }
    } });
    refresh.current = live.refresh;
    return () => live.dispose();
  }, [agentId]);
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);
  const name = data?.title || title;
  const self = data?.siblings?.find(child => child.id === agentId);
  const identityIcon = icon ?? self?.icon;
  const identityHue = colorHue ?? self?.colorHue;
  const cancel = () => { setEditing(false); titleRef.current?.focus(); };
  const save = async () => {
    if (lock.current || cancelled.current) return;
    const next = draft.trim();
    if (!next || next === name) { cancel(); return; }
    if (!data) return;
    lock.current = true; setSaving(true); setError(''); mutation.current++;
    try {
      const result = await renameChat(agentId, next, data.csrfToken);
      if (result.agentId !== agentId) throw new Error('Не удалось сохранить название');
      mutation.current++; setData(old => old && ({ ...old, title: result.title })); setEditing(false); onRenamed(); titleRef.current?.focus();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { lock.current = false; setSaving(false); }
  };
  return <header className="chat-header">
    <div className="chat-header-row">
      <div className="chat-header-cluster">
        {onMenu && <button type="button" className="chat-header-menu" aria-label="Открыть навигацию" onClick={onMenu}><Menu size={20} /></button>}
        {data?.parent && <><button type="button" className="chat-header-parent" title={`Вернуться: ${data.parent.title || data.parent.id}`} onClick={() => onSelect(data.parent!.id)}>{data.parent.title || data.parent.id}</button><span className="chat-header-separator">/</span></>}
        {agentId && <span className="chat-header-identity"><NavigationChatIcon icon={identityIcon} active={active ?? (self?.runState === 'running' || self?.runState === 'claimed')} /><span className={`workspace-chat-id ${identityHue != null ? 'has-agent-color' : ''}`} style={identityHue != null ? { '--agent-hue': identityHue } as CSSProperties : undefined}>{agentId}</span></span>}
        <div className="chat-header-name">
          <button ref={titleRef} type="button" className="chat-header-title" title={agentId ? 'Переименовать чат' : undefined} aria-label={agentId ? `Переименовать чат: ${name}` : undefined} disabled={!agentId || archived || !data} onClick={() => { cancelled.current = false; setDraft(name); setEditing(true); }}>{name}</button>
          {editing && <input ref={inputRef} className="chat-header-title-input" aria-label="Название чата" value={draft} maxLength={120} disabled={saving} aria-invalid={!!error} onChange={e => setDraft(e.target.value)} onBlur={() => { void save(); }} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; setDraft(name); cancel(); } if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void save(); } }} />}
        </div>
        {!!data?.children.length && <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger openOnHover delay={150} closeDelay={200} className="chat-header-team">{data.children.some(child => child.runState === 'running' || child.runState === 'claimed') && <span className="chat-header-team-dot" role="img" aria-label="Сабагенты работают" />}{`${data.children.length} ${data.children.length === 1 ? 'subagent' : 'subagents'}`}<ChevronDown size={14} strokeWidth={1} className={open ? 'is-open' : ''} /></Popover.Trigger>
          <Popover.Portal><Popover.Positioner side="bottom" align="start" sideOffset={4} collisionPadding={12} className="chat-header-positioner"><Popover.Popup className="chat-header-children" aria-label="Сабагенты">
            {data.children.map(child => <HeaderChildRow key={child.id} child={child} onOpenSide={onOpenSide ? () => { setOpen(false); onOpenSide(child.id, child.title); } : undefined} onSelect={id => { setOpen(false); onSelect(id); }} />)}
          </Popover.Popup></Popover.Positioner></Popover.Portal>
        </Popover.Root>}
      </div>
      <div className="chat-header-views" role="tablist" aria-label="Вид разговора"><button type="button" role="tab" aria-selected="true" className="chat-header-chat">Chat</button></div>
      <div className="chat-header-utilities"><span className="chat-header-width-control" ref={widthControlRef} />
      <button type="button" className="chat-header-canvas" aria-label={canvasOpen ? 'Свернуть Canvas' : 'Открыть Canvas'} aria-pressed={canvasOpen} disabled={canvasDisabled} onClick={onCanvas}><PanelRight size={16} strokeWidth={1} /></button></div>
    </div>
    {archived && <span className="chat-header-archived">Архив · только чтение</span>}
    {error && <div className="chat-header-error" role="alert">{error} <button type="button" onClick={() => refresh.current()}>Повторить</button></div>}
  </header>;
}
