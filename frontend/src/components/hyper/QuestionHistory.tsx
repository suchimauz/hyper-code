import { createContext, useContext, useId, useState } from 'react';
import { ChevronDown, ChevronUp, CircleCheck, CircleHelp, Table2 } from 'lucide-react';
import type { ChatEvent } from '../../lib/hyper';
import { choiceOptions, type ChoiceInput } from '../../lib/questions';
import type { ConfirmInput } from '../../lib/confirms';
import type { GridInput } from '../../lib/grids';
import { isHistoryKind, type HistoryInput } from '../../lib/history';
import './tool-row.css';
import './question-history.css';

export const QuestionHistoryContext = createContext<HistoryInput[]>([]);
/** Durable choice/confirm/grid identity (or legacy result envelope), never arrival-order pairing. */
export function choiceResultId(event: ChatEvent): string | null {
  if (event.type === 'input') return isHistoryKind(event.kind) && /^[A-Za-z0-9_-]{1,128}$/.test(event.inputId || '') ? event.inputId! : null;
  if (event.type !== 'user') return null;
  const envelope = /^<input-result\s+([^>]+)>[\s\S]*<\/input-result>\s*$/.exec(event.text || '');
  if (!envelope) return null;
  const attrs = Object.fromEntries([...envelope[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
  return isHistoryKind(attrs.kind) && ['submitted', 'cancelled'].includes(attrs.state) && /^[A-Za-z0-9_-]{1,128}$/.test(attrs.id || '') ? attrs.id : null;
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
export function historyGroups(events: ChatEvent[], inputs: HistoryInput[], agentId: string): ChatEvent[][] {
  const groups: ChatEvent[][] = [], seen = new Set<string>();
  let previousBatch: string | undefined;
  for (const event of events) {
    const id = choiceResultId(event);
    if (!id) { previousBatch = undefined; continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    const input = inputs.find(item => item.id === id && item.agentId === agentId && item.kind === 'choice' && item.state === 'submitted') as ChoiceInput | undefined;
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
function confirmSummary(input: ConfirmInput) {
  if (!input.result) return 'Ответ не сохранён';
  const decision = input.result.confirmed ? input.spec.confirmLabel || 'Да' : input.spec.declineLabel || 'Нет';
  return input.result.comment ? `${decision} — ${input.result.comment}` : decision;
}
function gridSummary(input: GridInput) {
  const rows = input.result?.rows || [];
  if (!rows.length) return 'Ответ не сохранён';
  return `Выбрано ${rows.length}: ${rows.map(cells => cells.find(Boolean) || '—').join(', ')}`;
}
function answerSummary(input?: HistoryInput) {
  if (!input) return 'Данные вопроса недоступны';
  if (input.state === 'cancelled') return input.kind === 'confirm' ? 'Подтверждение отменено' : 'Вопрос отменён';
  if (input.kind === 'confirm') return confirmSummary(input);
  if (input.kind === 'grid') return gridSummary(input);
  const options = choiceOptions(input);
  const values = input.result?.values || (input.result?.value !== undefined ? [input.result.value] : []);
  const answers = values.map(value => options.find(option => option.value === value)?.label || value);
  if (input.result?.other) answers.push(`Другое: ${input.result.other}`);
  return answers.join('; ') || 'Ответ не сохранён';
}
/** The same input/output sections as ToolBody, with human question/answer labels. */
function QuestionBody({ input }: { input: HistoryInput }) {
  if (input.kind === 'confirm') return input.spec.details ? <p>{input.spec.details}</p> : null;
  if (input.kind === 'grid') return <p>{input.spec.multiple ? 'Выбор нескольких строк' : 'Выбор одной строки'}: {input.spec.columns.map(column => column.label).join(', ')}</p>;
  return <ul>{choiceOptions(input).map(option => <li key={option.value}><span>{option.label || option.value}</span>{option.description && <span> — {option.description}</span>}</li>)}{input.spec.allowOther && <li>Другое — свой вариант</li>}</ul>;
}
function GridAnswer({ input }: { input: GridInput }) {
  const rows = input.result?.rows || [];
  return <div className="question-history-grid"><table><thead><tr>{input.spec.columns.map((column, index) => <th key={index} scope="col">{column.label}</th>)}</tr></thead>
    <tbody>{rows.map((cells, rowIndex) => <tr key={rowIndex}>{input.spec.columns.map((_, index) => <td key={index}>{cells[index]}</td>)}</tr>)}</tbody></table></div>;
}
/** The same input/output sections as ToolBody, with human question/answer labels. */
function QuestionAnswer({ input, inputId }: { input?: HistoryInput; inputId: string }) {
  const answered = input && input.state === 'submitted';
  return <>
    <section className="tool-io-section" aria-label="Вопрос" data-input-id={inputId}><h4>{input ? kindLabel(input.kind) : 'Вопрос'}</h4><div className="question-history-copy">
      {input ? <><div>{input.title}</div>{input.message && <p>{input.message}</p>}<QuestionBody input={input} /></>
        : <p>Исходный вопрос удалён или пока недоступен. Повторная отправка ответа из истории невозможна.</p>}
    </div></section>
    {input && <section className="tool-io-section" aria-label="Ответ" data-input-id={inputId}><h4>{answered ? 'Ответ' : 'Статус'}</h4><div className="question-history-copy">
      {answered && input.kind === 'grid' && input.result?.rows?.length ? <GridAnswer input={input} /> : answerSummary(input)}
    </div></section>}
  </>;
}
function kindLabel(kind: HistoryInput['kind']) { return kind === 'confirm' ? 'Подтверждение' : kind === 'grid' ? 'Таблица' : 'Вопрос'; }
export function QuestionHistory({ event, events = [event], agentId }: { event: ChatEvent; events?: ChatEvent[]; agentId: string }) {
  const inputs = useContext(QuestionHistoryContext);
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const items = events.map(event => ({ event, input: inputs.find(item => item.id === choiceResultId(event) && item.agentId === agentId && isHistoryKind(item.kind) && ['submitted', 'cancelled'].includes(item.state)) })).filter(item => item.event.type !== 'input' || item.input);
  if (!items.length) return null;
  const count = items.length;
  const summary = count === 1 ? answerSummary(items[0].input) : items.map(item => item.input?.title || 'Вопрос недоступен').join(' · ');
  const kind = items[0].input?.kind ?? 'choice';
  const Icon = kind === 'confirm' ? CircleCheck : kind === 'grid' ? Table2 : CircleHelp;
  const title = count === 1 ? kindLabel(kind) : 'Вопросы';
  return <article className="tool-row question-history" data-chat-flow-kind="question-history" data-event-idx={event.idx} data-input-id={choiceResultId(event)}>
    <button className="tool-row-summary question-history-toggle" type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>
      <span className="tool-row-leading"><Icon className="tool-row-icon" size={14} strokeWidth={1.4} aria-hidden="true" />{expanded ? <ChevronUp className="tool-row-toggle" size={14} aria-hidden="true" /> : <ChevronDown className="tool-row-toggle" size={14} aria-hidden="true" />}</span>
      <span className="tool-row-title">{title} · {count}</span>
      <span className="tool-row-dot" aria-hidden="true" /><span className="tool-row-description" title={summary}>{summary}</span>
    </button>
    <div id={detailsId} hidden={!expanded} className="tool-row-panel question-history-details">
      {expanded && <div className="tool-specialized-body"><div className="tool-io">
        {items.map(({ event: entry, input }) => <QuestionAnswer key={choiceResultId(entry)} input={input} inputId={choiceResultId(entry)!} />)}
      </div></div>}
    </div>
  </article>;
}
