import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { ChatMarkdown } from './ChatMarkdown';
import type { ChatEvent } from '../../lib/mauzcode';
import './compaction-row.css';

/** DSH CompactionCommandCard/CompactionItem: one history row, never a composer status. */
export function CompactionRow({ event }: { event: ChatEvent }) {
  const [open, setOpen] = useState(false);
  const running = event.type === 'compaction_start';
  const failed = event.type === 'compaction_failed';
  const detail = failed ? event.text : event.summary;
  const label = running ? 'Сжимаем контекст…' : failed ? 'Не удалось сжать контекст' : 'Контекст сжат';
  // Provider-measured "before" is exact; "after" is always a local estimate until the next request.
  const exactBefore = event.tokensBeforeSource === 'provider';
  const counts = !running && !failed && event.tokensBefore != null && event.tokensAfter != null
    ? `${exactBefore ? '' : '~'}${event.tokensBefore.toLocaleString()} → ~${event.tokensAfter.toLocaleString()} токенов` : '';
  return <div className="compaction-row" data-event-idx={event.idx} data-compaction-state={running ? 'running' : failed ? 'failed' : 'completed'}>
    <button type="button" className="compaction-row-toggle" disabled={!detail} aria-expanded={detail ? open : undefined} onClick={() => setOpen(value => !value)}>
      <span className="compaction-row-leading" aria-hidden="true"><Layers className="compaction-row-context" size={14} />{detail && (open ? <ChevronDown className="compaction-row-disclosure" size={14} /> : <ChevronRight className="compaction-row-disclosure" size={14} />)}</span>
      <span>compact</span><span className="compaction-row-sep" aria-hidden="true" /><span className="compaction-row-label" role={running ? 'status' : undefined}>{label}{counts && ` · ${counts}`}</span>
    </button>
    {open && detail && <div className="compaction-row-body markdown"><ChatMarkdown>{detail}</ChatMarkdown></div>}
  </div>;
}
