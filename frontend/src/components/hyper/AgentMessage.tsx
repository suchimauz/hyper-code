import { useId, useState, type CSSProperties } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react';
import type { ChatEvent } from '../../lib/hyper';
import { useToolReveal } from './useToolReveal';
import './tool-row.css';
import './agent-message.css';

/** Peer traffic uses the same disclosure and nested reveal as tool calls, never a human bubble. */
export function AgentMessage({ event }: { event: ChatEvent }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const outgoing = event.outgoingAgentMessage;
  const isOutgoing = !!outgoing || event.type === 'agent_message_outgoing';
  const incoming = event.agentMessage;
  const author = isOutgoing ? event.peerAuthor : event.author;
  const peer = outgoing?.to ?? incoming?.from ?? author?.agentId ?? event.actor?.replace(/^agent:/, '') ?? '?';
  const title = outgoing?.title ?? incoming?.title ?? author?.name ?? `Агент ${peer}`;
  const body = outgoing?.body ?? incoming?.body ?? event.text ?? '';
  const hue = Number.isFinite(author?.hue) ? author!.hue : 210;
  const { row, requestReveal } = useToolReveal(open, body);
  const Icon = isOutgoing ? ArrowUpRight : ArrowDownLeft;
  const date = new Date(event.ts);
  const time = event.ts > 0 && Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  return <section ref={row} className="tool-row agent-message" data-direction={isOutgoing ? 'outgoing' : 'incoming'} data-event-idx={event.idx} style={{ '--agent-hue': hue } as CSSProperties}>
    <button type="button" className="tool-row-summary" aria-expanded={open} aria-controls={id} onClick={() => { requestReveal(!open); setOpen(!open); }}>
      <span className="tool-row-leading"><Icon className="tool-row-icon" size={14} strokeWidth={1.4} aria-hidden="true" />{open ? <ChevronUp className="tool-row-toggle" size={14} aria-hidden="true" /> : <ChevronDown className="tool-row-toggle" size={14} aria-hidden="true" />}</span>
      <span className="tool-row-title">{isOutgoing ? 'Агенту ' : 'От агента '}<strong className="agent-message-id">{peer}</strong></span><span className="tool-row-dot" aria-hidden="true" />
      <span className="tool-row-description">{title}</span>
    </button>
    <div id={id} hidden={!open} className="tool-row-panel agent-message-body">
      {open && <div className="agent-message-content"><div className="agent-message-meta">{isOutgoing ? outgoing?.status === 'delivered' ? 'Отправлено' : 'В очереди' : 'Получено'} · {peer}{time && <> · <time dateTime={date.toISOString()}>{time}</time></>}</div><pre>{body}</pre></div>}
    </div>
  </section>;
}
