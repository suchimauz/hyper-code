import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Brain, Terminal, FileText, Search, Wrench, MessagesSquare } from 'lucide-react';
import type { ChatEvent } from '../../lib/hyper';
import { isPeer, type WorkTurn } from './transcriptGroups';
import './work-groups.css';

const OuterOpen = createContext(true);

/** Separate disclosure for contiguous tool/reasoning activity, as in dsh chat-fold. */
export function ProcessGroup({ events, children, live = false }: { events: ChatEvent[]; children: ReactNode; live?: boolean }) {
  const [choice, setChoice] = useState<{ live: boolean; open: boolean } | null>(null);
  const outerOpen = useContext(OuterOpen);
  const open = outerOpen && (choice?.live === live ? choice.open : live);
  const body = useRef<HTMLDivElement>(null);
  const following = useRef(false);
  const [edges, setEdges] = useState({ up: false, down: false });
  const syncEdges = () => { const el = body.current; if (el) setEdges({ up: el.scrollTop > 1, down: el.scrollTop < el.scrollHeight - el.clientHeight - 1 }); };
  // Polls preserve manual disclosure; a new activity phase restores its default.
  useEffect(() => { setChoice(null); }, [live, outerOpen]);
  useLayoutEffect(() => { const el = body.current; if (open && el) { el.scrollTop = live ? el.scrollHeight : 0; following.current = live; syncEdges(); } }, [open]);
  useLayoutEffect(() => {
    const el = body.current; if (!el) return;
    const reveal = () => { following.current = false; };
    el.addEventListener('hyper:reveal-tool', reveal);
    return () => el.removeEventListener('hyper:reveal-tool', reveal);
  }, [open]);
  useLayoutEffect(() => { const el = body.current; if (open && el) { if (following.current && !el.dataset.toolRevealing) el.scrollTop = el.scrollHeight; syncEdges(); } }, [events, open]);
  const id = useId();
  const messages = events.filter(isPeer).length;
  const thoughts = events.filter(event => !isPeer(event) && event.type === 'thinking').length;
  const tools = events.filter(event => !isPeer(event) && (event.type === 'tool_call' || event.type === 'tool_result')).length;
  // A solitary thinking disclosure already has its own compact presentation.
  if (events.length === 1 && thoughts === 1) return children;
  const names = events.map(event => event.name?.split('.').pop());
  const category = names.includes('bash') ? 'commands' : names.some(name => ['grep', 'find', 'glob'].includes(name || '')) ? 'search' : names.some(name => ['read', 'write', 'edit'].includes(name || '')) ? 'files' : tools ? 'tools' : messages ? 'messages' : 'thinking';
  const Icon = { commands: Terminal, search: Search, files: FileText, tools: Wrench, messages: MessagesSquare, thinking: Brain }[category];
  const plural = (count: number, one: string, few: string, many: string) => count % 100 >= 11 && count % 100 <= 14 ? many : count % 10 === 1 ? one : count % 10 >= 2 && count % 10 <= 4 ? few : many;
  const label = [thoughts ? `${thoughts} ${plural(thoughts, 'обдумывание', 'обдумывания', 'обдумываний')}` : '', tools ? `${tools} ${plural(tools, 'вызов', 'вызова', 'вызовов')} инструментов` : '', messages ? `${messages} ${plural(messages, 'сообщение', 'сообщения', 'сообщений')} между агентами` : ''].filter(Boolean).join(', ');
  return <section className="process-group" data-step-process="true">
    <button className="work-group-toggle process-group-toggle" data-process-activity={category} type="button" aria-expanded={open} aria-controls={id} onClick={() => setChoice({ live, open: !open })}>
      <span className="process-group-leading" aria-hidden="true"><Icon data-step-process-icon size={14} strokeWidth={1} /><ChevronDown data-step-process-chevron size={14} strokeWidth={1} /></span>
      <span className="process-group-summary">{label || 'Работа агента'}</span>
    </button>
    <div ref={body} id={id} className="process-group-body" data-scroll-up={edges.up || undefined} data-scroll-down={edges.down || undefined} hidden={!open} onScroll={() => { const el = body.current!; following.current = !el.dataset.toolRevealing && el.scrollTop >= el.scrollHeight - el.clientHeight - 1; syncEdges(); }}>{children}</div>
  </section>;
}

/** Latest completed work remains open until next input; stop/error/live never fold. */
export function WorkGroup({ turn, children }: { turn: WorkTurn; children: ReactNode }) {
  const [choice, setChoice] = useState<{ answer: number | undefined; open: boolean } | null>(null);
  const id = useId();
  if (!turn.completeStart || !turn.events.length) return children;
  const canFold = turn.status === 'completed' && !turn.run?.hasInterleavedInput;
  const open = !canFold || (choice && choice.answer === turn.answer?.idx ? choice.open : turn.latest);
  const elapsed = turn.run?.endedAt != null ? Math.max(0, Math.floor((turn.run.endedAt - turn.run.startedAt) / 1000)) : null;
  const duration = elapsed == null ? '' : ` за ${elapsed >= 60 ? `${Math.floor(elapsed / 60)} мин ` : ''}${elapsed % 60} с`;
  const label = turn.status === 'stopped' ? 'Остановлено' : turn.status === 'error' ? 'Работа завершилась с ошибкой' : turn.status === 'completed' ? `Завершено${duration}` : 'Работа агента';
  return <section className="work-group" data-work-status={turn.status}>
    {canFold ? <button className="work-group-toggle work-group-heading" type="button" aria-expanded={open} aria-controls={id} onClick={() => setChoice({ answer: turn.answer?.idx, open: !open })}>
      <span>{label}</span><ChevronDown size={14} strokeWidth={1} aria-hidden="true" />
    </button> : turn.status !== 'open' ? <div className="work-group-heading">{label}</div> : null}
    <OuterOpen.Provider value={open}><div id={id} hidden={!open}>{children}</div></OuterOpen.Provider>
  </section>;
}
