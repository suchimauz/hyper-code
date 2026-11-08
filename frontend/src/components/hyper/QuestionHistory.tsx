import { createContext, useContext, useId, useState } from 'react';
import { ChevronDown, ChevronUp, CircleHelp } from 'lucide-react';
import type { ChatEvent } from '../../lib/hyper';
import { choiceOptions, type ChoiceInput } from '../../lib/questions';
import './tool-row.css';
import './question-history.css';

export const QuestionHistoryContext = createContext<ChoiceInput[]>([]);
/** Durable choice identity (or legacy result envelope), never arrival-order pairing. */
export function choiceResultId(event: ChatEvent): string | null {
  if (event.type === 'input') return event.kind === 'choice' && /^[A-Za-z0-9_-]{1,128}$/.test(event.inputId || '') ? event.inputId! : null;
  if (event.type !== 'user') return null;
  const envelope = /^<input-result\s+([^>]+)>[\s\S]*<\/input-result>\s*$/.exec(event.text || '');
  if (!envelope) return null;
  const attrs = Object.fromEntries([...envelope[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
  return attrs.kind === 'choice' && ['submitted', 'cancelled'].includes(attrs.state) && /^[A-Za-z0-9_-]{1,128}$/.test(attrs.id || '') ? attrs.id : null;
}
/** Project each reply once at its durable request position, before splitting runs.
 * Result-only legacy history stays at its own position, but is not a human turn.
 * Retain the result envelope for a missing/deleted input's read-only fallback. */
export function coalesceQuestionHistory(events: ChatEvent[]): ChatEvent[] {
  const durable = new Set(events.filter(event => event.type === 'input').map(choiceResultId).filter(Boolean));
  const results = new Map(events.filter(event => event.type === 'user' && choiceResultId(event)).map(event => [choiceResultId(event), event]));
  const seen = new Set<string>();
  return events.flatMap(event => {
    const id = choiceResultId(event);
    if (!id) return [event];
    if (seen.has(id) || (event.type === 'user' && durable.has(id))) return [];
    seen.add(id);
    const result = event.type === 'input' ? results.get(id) : undefined;
    return [{ ...(result || event), idx: event.idx, ts: event.ts, messageIdx: event.messageIdx, navigationEligible: false }];
  });
}

/** Only consecutive, proven batch members group; never cross a real message. */
export function historyGroups(events: ChatEvent[], inputs: ChoiceInput[], agentId: string): ChatEvent[][] {
  const groups: ChatEvent[][] = [], seen = new Set<string>();
  let previousBatch: string | undefined;
  for (const event of events) {
    const id = choiceResultId(event);
    if (!id) { previousBatch = undefined; continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    const input = inputs.find(item => item.id === id && item.agentId === agentId && item.kind === 'choice' && item.state === 'submitted');
    const batch = input?.batchId;
    if (batch && batch === previousBatch) groups.at(-1)!.push(event);
    else groups.push([event]);
    previousBatch = batch;
  }
  return groups;
}
export function QuestionHistoryList({ events, agentId }: { events: ChatEvent[]; agentId: string }) {
  const inputs = useContext(QuestionHistoryContext);
  const groups = historyGroups(events, inputs, agentId);
  if (!groups.length) return null;
  return <div className="process-group-body question-history-list">{groups.map(group => <QuestionHistory key={choiceResultId(group[0])!} event={group[0]} events={group} agentId={agentId} />)}</div>;
}
function answerSummary(input?: ChoiceInput) {
  if (!input) return 'Данные вопроса недоступны';
  if (input.state === 'cancelled') return 'Вопрос отменён';
  const options = choiceOptions(input);
  const values = input.result?.values || (input.result?.value !== undefined ? [input.result.value] : []);
  const answers = values.map(value => options.find(option => option.value === value)?.label || value);
  if (input.result?.other) answers.push(`Другое: ${input.result.other}`);
  return answers.join('; ') || 'Ответ не сохранён';
}
/** The same input/output sections as ToolBody, with human question/answer labels. */
function QuestionAnswer({ input, inputId }: { input?: ChoiceInput; inputId: string }) {
  return <>
    <section className="tool-io-section" aria-label="Вопрос" data-input-id={inputId}><h4>Вопрос</h4><div className="question-history-copy">
      {input ? <><div>{input.title}</div>{input.message && <p>{input.message}</p>}
        <ul>{choiceOptions(input).map(option => <li key={option.value}><span>{option.label || option.value}</span>{option.description && <span> — {option.description}</span>}</li>)}{input.spec.allowOther && <li>Другое — свой вариант</li>}</ul>
      </> : <p>Исходный вопрос удалён или пока недоступен. Повторная отправка ответа из истории невозможна.</p>}
    </div></section>
    {input && <section className="tool-io-section" aria-label="Ответ" data-input-id={inputId}><h4>{input.state === 'cancelled' ? 'Статус' : 'Ответ'}</h4><div className="question-history-copy">{answerSummary(input)}</div></section>}
  </>;
}
export function QuestionHistory({ event, events = [event], agentId }: { event: ChatEvent; events?: ChatEvent[]; agentId: string }) {
  const inputs = useContext(QuestionHistoryContext);
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const items = events.map(event => ({ event, input: inputs.find(item => item.id === choiceResultId(event) && item.agentId === agentId && item.kind === 'choice' && ['submitted', 'cancelled'].includes(item.state)) })).filter(item => item.event.type !== 'input' || item.input);
  if (!items.length) return null;
  const count = items.length;
  const summary = count === 1 ? answerSummary(items[0].input) : items.map(item => item.input?.title || 'Вопрос недоступен').join(' · ');
  return <article className="tool-row question-history" data-chat-flow-kind="question-history" data-event-idx={event.idx} data-input-id={choiceResultId(event)}>
    <button className="tool-row-summary question-history-toggle" type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>
      <span className="tool-row-leading"><CircleHelp className="tool-row-icon" size={14} strokeWidth={1.4} aria-hidden="true" />{expanded ? <ChevronUp className="tool-row-toggle" size={14} aria-hidden="true" /> : <ChevronDown className="tool-row-toggle" size={14} aria-hidden="true" />}</span>
      <span className="tool-row-title">{count === 1 ? 'Вопрос' : 'Вопросы'} · {count}</span>
      <span className="tool-row-dot" aria-hidden="true" /><span className="tool-row-description" title={summary}>{summary}</span>
    </button>
    <div id={detailsId} hidden={!expanded} className="tool-row-panel question-history-details">
      {expanded && <div className="tool-specialized-body"><div className="tool-io">
        {items.map(({ event: entry, input }) => <QuestionAnswer key={choiceResultId(entry)} input={input} inputId={choiceResultId(entry)!} />)}
      </div></div>}
    </div>
  </article>;
}
