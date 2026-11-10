import { useId, useState } from 'react';
import { ChevronDown, Terminal } from 'lucide-react';
import type { ChatEvent } from '../../lib/mauzcode';
import { ToolModal } from './ToolModal';
import { useIsMobile } from '../../hooks/useIsMobile';
import './command-row.css';

/** Persistent command lifecycle disclosure, following dsh's MIT UI pattern. */
export function CommandRow({ event }: { event: ChatEvent }) {
  const [expanded, setExpanded] = useState(false);
  const mobile = useIsMobile();
  const id = useId();
  const status = event.status || (event.type === 'command_invocation' ? 'running' : 'completed');
  const running = status === 'running';
  const failed = status === 'failed';
  const label = running ? 'Выполняется' : failed ? 'Ошибка выполнения' : status === 'interrupted' ? 'Прервано' : 'Завершено';
  // Presentation only: retain the original event and unrelated command output.
  const text = event.commandName === 'plan'
    ? event.text?.replace(/^Planning mode enabled \(advisory, not a sandbox\)(?=\s*$)/, 'Planning mode enabled')
    : event.text;
  const summary = running ? label : text || label;
  const body = summary.includes('\n') ? summary : null;
  const open = expanded && !!body;
  const content = <><Terminal size={14} strokeWidth={1} aria-hidden="true" /><span className="command-row-name">{event.commandName || 'Команда'}</span><span className="command-row-dot" aria-hidden="true" /><span className="command-row-summary">{summary}</span>{body && <ChevronDown size={14} strokeWidth={1} aria-hidden="true" />}</>;
  return <section className="command-row" data-event-idx={event.idx} data-command-operation={event.operationId} data-state={status} aria-busy={running}>
    <span className="command-row-status" role="status">{label}</span>
    {body ? <button type="button" className="command-row-heading" aria-expanded={mobile ? undefined : open} aria-haspopup={mobile ? 'dialog' : undefined} aria-controls={mobile ? undefined : id} onClick={() => setExpanded(value => !value)}>{content}</button> : <div className="command-row-heading">{content}</div>}
    {body && (mobile ? <ToolModal open={open} onOpenChange={setExpanded} title={event.commandName || 'Команда'}><pre id={id} className="command-row-body">{body}</pre></ToolModal> : <pre id={id} className="command-row-body" hidden={!open}>{body}</pre>)}
  </section>;
}
