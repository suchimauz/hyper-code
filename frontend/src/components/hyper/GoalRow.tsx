import { useId, useState } from 'react';
import { ChevronDown, Target } from 'lucide-react';
import type { ChatEvent } from '../../lib/hyper';
import { goalStatus } from '../../lib/goal';
import { ToolModal } from './ToolModal';
import { useIsMobile } from '../../hooks/useIsMobile';
import './command-row.css';

/** Human label for one goal lifecycle transition (start, pause, resume, finish). */
export function goalTransitionLabel(event: Pick<ChatEvent, 'goalStatus' | 'goalBeforeStatus'>): string {
  const after = event.goalStatus, before = event.goalBeforeStatus;
  if (!after) return 'Цель удалена';
  if (after === 'active') return before == null ? 'Цель запущена' : 'Цель возобновлена';
  if (after === 'paused') return before == null ? 'Цель создана на паузе' : 'Цель на паузе';
  if (after === 'complete') return 'Цель завершена';
  if (after === 'blocked') return 'Цели нужна помощь';
  if (after === 'budget_limited') return 'Бюджет цели исчерпан';
  if (after === 'usage_limited') return 'Лимит использования цели';
  return 'Цель изменена';
}

const statusName = (status?: string | null) => status ? goalStatus[status as keyof typeof goalStatus] ?? status : '—';

/** Goal lifecycle row with the same disclosure behaviour as command/tool rows. */
export function GoalRow({ event }: { event: ChatEvent }) {
  const [expanded, setExpanded] = useState(false);
  const mobile = useIsMobile();
  const id = useId();
  const label = goalTransitionLabel(event);
  const state = event.goalStatus === 'blocked' || event.goalStatus?.endsWith('_limited') ? 'failed' : 'completed';
  const time = Number.isFinite(event.ts) ? new Date(event.ts).toLocaleString('ru-RU') : '';
  const body = [
    event.text ? `Цель: ${event.text}` : '',
    `Статус: ${statusName(event.goalBeforeStatus)} → ${statusName(event.goalStatus)}`,
    time ? `Время: ${time}` : '',
  ].filter(Boolean).join('\n');
  const content = <><Target size={14} strokeWidth={1} aria-hidden="true" /><span className="command-row-name">goal</span><span className="command-row-dot" aria-hidden="true" /><span className="command-row-summary">{label}{event.text ? ` — ${event.text}` : ''}</span><ChevronDown size={14} strokeWidth={1} aria-hidden="true" /></>;
  return <section className="command-row goal-row" data-event-idx={event.idx} data-state={state} data-goal-status={event.goalStatus ?? 'cleared'}>
    <button type="button" className="command-row-heading" aria-expanded={mobile ? undefined : expanded} aria-haspopup={mobile ? 'dialog' : undefined} aria-controls={mobile ? undefined : id} onClick={() => setExpanded(value => !value)}>{content}</button>
    {mobile
      ? <ToolModal open={expanded} onOpenChange={setExpanded} title={label}><pre id={id} className="command-row-body">{body}</pre></ToolModal>
      : <pre id={id} className="command-row-body" hidden={!expanded}>{body}</pre>}
  </section>;
}
