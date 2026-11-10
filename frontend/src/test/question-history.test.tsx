import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { QuestionHistoryContext, QuestionHistoryList, historyGroups, choiceResultId, coalesceQuestionHistory } from '../components/mauzcode/QuestionHistory';
import { Transcript } from '../components/mauzcode/Transcript';
import { TranscriptMessage } from '../components/mauzcode/TranscriptMessage';
import type { ChatEvent } from '../lib/mauzcode';
import type { ChoiceInput } from '../lib/questions';
afterEach(cleanup);
const event = (id: string, kind = 'choice'): ChatEvent => ({ idx: 1, ts: 0, type: 'user', text: `<input-result id="${id}" kind="${kind}" state="submitted">\nUntrusted summary\n{}\n</input-result>` });
const input = (id: string): ChoiceInput => ({ id, agentId: 'a', kind: 'choice', title: `Question ${id}`, message: 'Original question?', state: 'submitted', spec: { options: [{ value: 'x', label: 'Readable X', description: 'Option description' }, 'Y'], multiple: true, allowOther: true }, result: { values: ['x'], other: 'Actual custom answer' } });
const show = (inputs: ChoiceInput[], e = event('q1')) => render(<QuestionHistoryContext.Provider value={inputs}><TranscriptMessage event={e} agentId="a" /></QuestionHistoryContext.Provider>);
describe('question reply history', () => {
 it('projects durable input events inside completed work, joining each item by id', () => {
  const ids = ['inb5151a163e137ade', 'inbc7a809ea1b342b6'];
  const events: ChatEvent[] = ids.map((inputId, i) => ({ idx: 1096 + i, messageIdx: 1026, ts: 1794102189919 + i, type: 'input', kind: 'choice', inputId, text: null, html: null, navigationEligible: false }));
  render(<QuestionHistoryContext.Provider value={ids.map(id => input(id)).reverse()}><Transcript agentId="a" events={events} page={{ runs: [{ id: 'completed', startIdx: 1095, endIdx: 1098, startedAt: 1, endedAt: 2, status: 'completed', answerIdx: null, hasInterleavedInput: false }], isRunning: false } as never} hasOlder={false} loadingOlder={false} loadOlder={async () => {}} /></QuestionHistoryContext.Provider>);
  const toggles = screen.getAllByRole('button', { name: /Вопрос/ });
  expect(toggles).toHaveLength(2);
  for (const [i, toggle] of toggles.entries()) { expect(toggle.closest('[hidden]')).toBeNull(); expect(toggle.closest('.work-group')).toBeTruthy(); expect(toggle.closest('.process-group')).toBeNull(); fireEvent.click(toggle); expect(screen.getByText(`Question ${ids[i]}`)).toBeTruthy(); }
  fireEvent.click(screen.getByRole('button', { name: /Завершено/ }));
  expect(screen.queryByRole('button', { name: /Вопрос/ })).toBeNull();
 });
 it('does not show pending durable inputs or special forms in reply history', () => {
  show([{ ...input('q1'), state: 'open' }], { idx: 1, ts: 1, type: 'input', kind: 'choice', inputId: 'q1', text: null });
  expect(screen.queryByRole('button')).toBeNull();
  for (const kind of ['tbank-login', 'redmine-approval']) expect(choiceResultId({ idx: 1, ts: 1, type: 'input', kind, inputId: 'q1', text: null })).toBeNull();
 });
 it('uses native id, not API order, renders labels/Other and original details only after expansion', () => {
  show([input('q2'), input('q1')]);
  expect(screen.queryByText('Original question?')).toBeNull();
  expect(screen.queryByText(/Untrusted summary/)).toBeNull();
  const toggle = screen.getByRole('button', { name: /Вопрос/ });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('Question q1')).toBeTruthy();
  expect(screen.queryByText('Question q2')).toBeNull();
  expect(screen.getByText('Original question?')).toBeTruthy();
  expect(screen.getByText('Readable X')).toBeTruthy();
  expect(screen.getByText(/Option description/)).toBeTruthy();
  expect(screen.getAllByText('Readable X; Другое: Actual custom answer')).toHaveLength(2);
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getAllByRole('button')).toHaveLength(1);
 });
 it('distinguishes cancellation from empty answers', () => {
  show([{ ...input('q1'), state: 'cancelled', result: null }]);
  expect(screen.getByText('Вопрос отменён')).toBeTruthy();
 });
 it('does not expose another agent input, and gracefully handles deleted input', () => {
  show([{ ...input('q1'), agentId: 'other' }]);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Данные вопроса недоступны')).toBeTruthy();
  expect(screen.queryByText('Original question?')).toBeNull();
 });
 it('does not project bank or redmine envelopes, or assistant quoted text', () => {
  for (const kind of ['tbank-login', 'redmine-approval']) expect(choiceResultId(event('q1', kind))).toBeNull();
  expect(choiceResultId({ ...event('q1'), type: 'assistant' })).toBeNull();
  expect(choiceResultId({ ...event('q1'), text: `Quoted ${event('q1').text}` })).toBeNull();
 });
});

it('groups only proven consecutive batch members and retains independent old entries', () => {
 const batchId = 'aa103955-a203-41a1-8191-dc7030fa9210';
 const inputs = ['q1','q2'].map(id => ({...input(id), batchId}));
 const events: ChatEvent[] = ['q1','q2'].map((inputId,i) => ({idx:i+1, ts:i, type:'input', kind:'choice', inputId, text:null}));
 render(<QuestionHistoryContext.Provider value={inputs}><QuestionHistoryList events={events} agentId="a" /></QuestionHistoryContext.Provider>);
 expect(screen.getAllByRole('button')).toHaveLength(1);
 expect(screen.getByText('Вопросы · 2')).toBeTruthy();
 expect(screen.getByRole('button')).toHaveClass('tool-row-summary');
 expect(document.querySelector('.question-history')).toHaveClass('tool-row');
 expect(document.querySelector('.message--user')).toBeNull();
 fireEvent.click(screen.getByRole('button'));
 expect(screen.getByText('Question q1')).toBeTruthy(); expect(screen.getByText('Question q2')).toBeTruthy();
 expect(historyGroups([events[0],{idx:3,ts:3,type:'user',text:'Real human'},events[1]],inputs,'a')).toHaveLength(2);
 expect(historyGroups(events,inputs.map(({batchId,...rest})=>rest),'a')).toHaveLength(2);
 expect(historyGroups([...events,{...event('q1'),idx:4}],inputs,'a').flat()).toHaveLength(2);
 expect(historyGroups(events,inputs,'foreign')).toHaveLength(2);
});

it('uses tool list gutters and detail sections and collapses with the keyboard', async () => {
 const user = (await import('@testing-library/user-event')).default.setup();
 render(<QuestionHistoryContext.Provider value={[input('q1')]}><QuestionHistoryList events={[event('q1')]} agentId="a" /></QuestionHistoryContext.Provider>);
 const toggle = screen.getByRole('button');
 expect(toggle.closest('.question-history-list')).toHaveClass('process-group-body');
 toggle.focus(); await user.keyboard('{Enter}');
 expect(toggle).toHaveAttribute('aria-expanded', 'true');
 const question = screen.getByRole('region', { name: 'Вопрос' });
 const answer = screen.getByRole('region', { name: 'Ответ' });
 expect(question).toHaveClass('tool-io-section');
 expect(answer).toHaveClass('tool-io-section');
 expect(question.closest('.tool-specialized-body')).toBe(answer.closest('.tool-specialized-body'));
 expect(question.closest('.tool-row-panel')).toBeTruthy();
 expect(question).toHaveAttribute('data-input-id', 'q1');
 await user.keyboard(' ');
 expect(toggle).toHaveAttribute('aria-expanded', 'false');
 expect(screen.queryByRole('region', { name: 'Вопрос' })).toBeNull();
 expect(toggle).toHaveFocus();
});

it('keeps a batch beside tools: only the outer collapse hides questions; result echoes do not create another turn', () => {
 const inputs = ['q1', 'q2'].map(id => ({ ...input(id), batchId: 'batch' }));
 const events: ChatEvent[] = [
  { idx: 1, ts: 1, type: 'user', messageIdx: 1, text: 'First prompt' },
  { idx: 2, ts: 2, type: 'tool_call', name: 'read', text: '{}' },
  ...['q1', 'q2'].map((inputId, i): ChatEvent => ({ idx: 3 + i, ts: 3 + i, type: 'input', kind: 'choice', inputId, text: null })),
  { idx: 5, ts: 5, type: 'assistant', text: 'First answer', isFinalReply: true },
  { ...event('q1'), idx: 6, messageIdx: 6 },
  { ...event('q2'), idx: 7, messageIdx: 7 },
  { idx: 8, ts: 8, type: 'user', messageIdx: 8, text: 'Second prompt' },
  { idx: 9, ts: 9, type: 'assistant', text: 'Second answer', isFinalReply: true },
 ];
 const { container } = render(<QuestionHistoryContext.Provider value={inputs}><Transcript agentId="a" events={events} page={{ runs: [{ id: 'first', startIdx: 2, endIdx: 5, startedAt: 1, endedAt: 5, status: 'completed', answerIdx: 5, hasInterleavedInput: false }], isRunning: false } as never} hasOlder={false} loadingOlder={false} loadOlder={async () => {}} /></QuestionHistoryContext.Provider>);
 const outer = screen.getByRole('button', { name: /Завершено/ });
 expect(outer).toHaveAttribute('aria-expanded', 'false');
 expect(screen.queryByRole('button', { name: /Вопрос/ })).toBeNull();
 expect(container.querySelectorAll('.question-history')).toHaveLength(1);
 fireEvent.click(outer);
 const question = screen.getByRole('button', { name: /Вопросы · 2/ });
 const tools = screen.getByRole('button', { name: /1 вызов инструментов/ });
 expect(tools).toHaveAttribute('aria-expanded', 'false');
 expect(question.closest('.process-group')).toBeNull();
 expect(question.closest('.work-group')).toBe(outer.closest('.work-group'));
 fireEvent.click(tools);
 expect(question.closest('[hidden]')).toBeNull();
 fireEvent.click(tools);
 expect(question.closest('[hidden]')).toBeNull();
 fireEvent.click(question);
 expect(screen.getByText('Question q1')).toBeTruthy();
 expect(screen.getByText('Question q2')).toBeTruthy();
 fireEvent.click(outer);
 expect(question.closest('[hidden]')).not.toBeNull();
 expect(screen.getByText('First answer').closest('[hidden]')).toBeNull();
 expect(screen.getAllByText('Second prompt')[0].closest('[hidden]')).toBeNull();
});

it('retains result-only legacy fallback in its work group without swallowing real human messages', () => {
 const events: ChatEvent[] = [
  { idx: 1, ts: 1, type: 'user', messageIdx: 1, text: 'Prompt' },
  { ...event('deleted'), idx: 2, messageIdx: 2 },
  { idx: 3, ts: 3, type: 'assistant', text: 'Answer', isFinalReply: true },
 ];
 render(<Transcript agentId="a" events={events} page={null} hasOlder={false} loadingOlder={false} loadOlder={async () => {}} />);
 const question = screen.getByRole('button', { name: /Вопрос · 1/ });
 expect(question.closest('.work-group')).toBeTruthy();
 fireEvent.click(question);
 expect(screen.getByText(/Исходный вопрос удалён/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: /Завершено/ }));
 expect(question.closest('[hidden]')).not.toBeNull();
 expect(screen.getByText('Prompt').closest('[hidden]')).toBeNull();
});

it('keeps durable identity/position with a missing-input reply fallback and deduplicates across runs', () => {
 const request: ChatEvent = { idx: 2, ts: 20, type: 'input', inputId: 'gone', kind: 'choice', text: null };
 const reply = { ...event('gone'), idx: 9, messageIdx: 7 };
 const projected = coalesceQuestionHistory([request, reply]);
 expect(projected).toHaveLength(1);
 expect(projected[0]).toMatchObject({ idx: 2, ts: 20, navigationEligible: false, text: reply.text });
 render(<QuestionHistoryList events={projected} agentId="a" />);
 fireEvent.click(screen.getByRole('button', { name: /Вопрос · 1/ }));
 expect(screen.getByText(/Исходный вопрос удалён/)).toBeTruthy();
});
