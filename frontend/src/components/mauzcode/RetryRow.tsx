import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, RotateCw } from 'lucide-react';
import type { ChatEvent } from '../../lib/mauzcode';
import './compaction-row.css';

function seconds(ms: number) { return Math.max(1, Math.ceil(ms / 1000)); }

/** DSH ModelRetryItem: one durable model-request retry with a live countdown while scheduled. */
export function RetryRow({ event }: { event: ChatEvent }) {
  const [open, setOpen] = useState(false);
  const delayMs = Math.max(0, Number(event.delayMs ?? 0));
  const deadline = event.ts + delayMs;
  const state = event.retryState ?? 'scheduled';
  const active = state === 'scheduled' && deadline > Date.now();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active, deadline]);
  const maximum = event.retryMode === 'always' || event.maxRetries == null ? '∞' : String(event.maxRetries);
  const left = active ? seconds(deadline - now) : seconds(delayMs);
  const label = state === 'cancelled' ? 'Повтор отменён' : state === 'started' ? 'Повтор запущен' : active ? `Повтор через ${left} с` : 'Повтор запланирован';
  const code = event.failureCode ? `${event.failureCode}${event.failureStatus ? ` · ${event.failureStatus}` : ''}` : '';
  const detail = [code, event.provider, event.failureMessage].filter(Boolean).join('\n');
  return <div className="compaction-row retry-row" data-event-idx={event.idx} data-retry-state={state} data-active={active || undefined}>
    <button type="button" className="compaction-row-toggle" disabled={!detail} aria-expanded={detail ? open : undefined} onClick={() => setOpen(value => !value)}>
      <span className="compaction-row-leading" aria-hidden="true"><RotateCw className="compaction-row-context" size={14} />{detail && (open ? <ChevronDown className="compaction-row-disclosure" size={14} /> : <ChevronRight className="compaction-row-disclosure" size={14} />)}</span>
      <span>retry {event.retry ?? 1}/{maximum}</span><span className="compaction-row-sep" aria-hidden="true" /><span className="compaction-row-label" role={active ? 'status' : undefined}>{label}{code && ` · ${code}`}{event.failureMessage && ` · ${event.failureMessage}`}</span>
    </button>
    {open && detail && <pre className="compaction-row-body retry-row-body">{detail}</pre>}
  </div>;
}
