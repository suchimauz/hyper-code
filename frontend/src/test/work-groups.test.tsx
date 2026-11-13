import { expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ChatEvent } from '../lib/mauzcode';
import { isGitReview, processEntries, workTurns } from '../components/mauzcode/transcriptGroups';
import { Transcript } from '../components/mauzcode/Transcript';
const ev = (idx: number, type: string, text = '', extra: Partial<ChatEvent> = {}): ChatEvent => ({ idx, ts: idx * 1000, type, text, ...extra });
const history = [ev(0, 'user', 'Question', { messageIdx: 0 }), ev(1, 'assistant', 'Checking'), ev(2, 'tool_call', '', { name: 'read' }), ev(3, 'tool_call', '', { name: 'unfamiliar_tool' }), ev(4, 'assistant', 'Final answer')];
const props = { agentId: 'a', events: history, page: null, hasOlder: false, loadingOlder: false, loadOlder: async () => {} };
it('uses assistant replies as process boundaries, not tool names', () => {
  const entries = processEntries([ev(0, 'thinking'), ev(1, 'tool_call', '', { name: 'read' }), ev(2, 'tool_call', '', { name: 'write' }), ev(3, 'assistant'), ev(4, 'tool_call')]);
  expect(entries.map(entry => entry.kind)).toEqual(['process', 'message', 'process']);
  expect(entries[0].kind === 'process' && entries[0].events.length).toBe(3);
});
it('does not treat UI-only user notices as a new turn or infer boundaries from tool names', () => {
  const turns = workTurns([...history.slice(0, 3), ev(7, 'user', '/system-command'), ...history.slice(3)], false);
  expect(turns).toHaveLength(1);
  expect(turns[0].answer?.text).toBe('Final answer');
  expect(turns[0].events.some(event => event.idx === 7)).toBe(true);
});
it('does not claim paginated history as a complete run', () => {
  expect(workTurns(history.slice(2), false)[0].completeStart).toBe(false);
});
it('does not mistake commentary before a tool for the final answer', () => {
  const turn = workTurns(history.slice(0, 4), false)[0];
  expect(turn.answer).toBeUndefined();
  expect(turn.status).toBe('open');
});
it('keeps the latest completed work open, folds on next real input and preserves final answer', () => {
  const view = render(<Transcript {...props} />);
  expect(screen.getByRole('button', { name: 'Завершено' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Checking')).toBeVisible();
  view.rerender(<Transcript {...props} events={[...history, ev(5, 'user', 'Next', { messageIdx: 5 })]} />);
  expect(screen.getByRole('button', { name: 'Завершено' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('Checking')).not.toBeVisible();
  expect(screen.getByText('Final answer')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Завершено' }));
  expect(screen.getByText('Checking')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '2 вызова инструментов' }));
  expect(screen.getByRole('button', { name: /unfamiliar_tool/ })).toBeVisible();
});
it('never auto-folds stopped and failed work', () => {
  for (const type of ['stop', 'error']) {
    const view = render(<Transcript {...props} events={[...history.slice(0, 4), ev(4, type), ev(5, 'user', 'Next', { messageIdx: 5 })]} />);
    expect(screen.getByText('Checking')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Завершено' })).toBeNull();
    expect(screen.getByRole('button', { name: '2 вызова инструментов' })).toHaveAttribute('aria-expanded', 'false');
    view.unmount();
  }
});
it('honors manual disclosure on subsequent polls', () => {
  const view = render(<Transcript {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Завершено' }));
  view.rerender(<Transcript {...props} events={[...history]} />);
  expect(screen.getByRole('button', { name: 'Завершено' })).toHaveAttribute('aria-expanded', 'false');
});
it('successful reply recovers tool failures without falsely marking the whole run failed', () => {
  const turns = workTurns([history[0], ev(1, 'tool_call', '', { name: 'bash', isError: true }), history[4]], false);
  expect(turns[0].status).toBe('completed');
  expect(turns[0].answer?.text).toBe('Final answer');
});

it('standard mode resets local process disclosure when outer work closes', () => {
  render(<Transcript {...props} />);
  const process = screen.getByRole('button', { name: '2 вызова инструментов' });
  expect(process).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(process);
  expect(process).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Завершено' }));
  fireEvent.click(screen.getByRole('button', { name: 'Завершено' }));
  expect(screen.getByRole('button', { name: '2 вызова инструментов' })).toHaveAttribute('aria-expanded', 'false');
});

it('uses a leading category icon and hover chevron without a trailing process chevron', () => {
  render(<Transcript {...props} events={[history[0], ev(1, 'tool_call', '', { name: 'bash' }), history[4]]} />);
  const button = screen.getByRole('button', { name: '1 вызов инструментов' });
  expect(button).toHaveAttribute('data-process-activity', 'commands');
  expect(button.querySelector('.process-group-leading [data-step-process-icon]')).not.toBeNull();
  expect(button.querySelector('.process-group-leading [data-step-process-chevron]')).not.toBeNull();
  expect(button.querySelector(':scope > svg')).toBeNull();
});

it('uses durable run ranges across partial pages and interleaved input, not final-looking commentary', () => {
  const runs = [{ id: 'run-1', startIdx: 1, endIdx: 9, startedAt: 1000, endedAt: 5000, status: 'completed' as const, answerIdx: 9, hasInterleavedInput: true }];
  const events = [ev(4, 'assistant', 'Commentary'), ev(5, 'user', 'Interrupting input', { messageIdx: 8 }), ev(6, 'tool_call'), ev(9, 'assistant', 'Real final')];
  const turns = workTurns(events, false, runs);
  expect(turns).toHaveLength(1);
  expect(turns[0].completeStart).toBe(true);
  expect(turns[0].answer?.idx).toBe(9);
  expect(turns[0].events.map(e => e.idx)).toEqual([4, 5, 6]);
});
it('does not use peer or service input as a collapse boundary', () => {
  const turns = workTurns([...history, ev(5, 'user', 'Peer update', { messageIdx: 5, navigationEligible: false })], false);
  expect(turns).toHaveLength(1);
});


it('folds legacy paginated work before a current durable run, including peer traffic', () => {
  const incoming=ev(11,'user','peer',{messageIdx:11,navigationEligible:false,agentMessage:{from:'ab',body:'peer'}});
  const outgoing=ev(13,'agent_message_outgoing','',{outgoingAgentMessage:{to:'ab',body:'reply',status:'delivered'}});
  const events=[ev(10,'tool_call'),incoming,ev(12,'assistant','Confirmed final',{isFinalReply:true}),outgoing,ev(14,'user','Next',{messageIdx:14}),ev(16,'tool_call')];
  const runs=[{id:'new',startIdx:15,endIdx:null,startedAt:100,endedAt:null,status:'open' as const,answerIdx:null,hasInterleavedInput:false}];
  const turns=workTurns(events,true,runs);
  expect(turns[0].status).toBe('completed');
  expect(turns[0].completeStart).toBe(true);
  expect(turns[0].latest).toBe(false);
  expect(turns[0].answer?.idx).toBe(12);
  expect(turns[0].events.map(e=>e.idx)).toEqual([10,11,13]);
  const {container}=render(<Transcript {...props} events={events} page={{isRunning:true,runs} as never} />);
  expect(screen.getByRole('button',{name:'Завершено'})).toHaveAttribute('aria-expanded','false');
  expect(screen.getByText('Confirmed final')).toBeVisible();
  expect(container.querySelector('.work-group [hidden] .agent-message')).not.toBeNull();
});
it('does not mark a persisted commentary as final even when it ends a page',()=>{
  expect(workTurns([ev(10,'tool_call'),ev(11,'assistant','commentary',{isFinalReply:false})],false)[0].status).toBe('open');
});

it('keeps only the current trailing process open across polls and appended tools', () => {
  const events = [history[0], ev(1, 'tool_call'), ev(2, 'assistant', 'Still checking', { isFinalReply: false }), ev(3, 'tool_call')];
  const page = { agentId: 'a', events, olderBefore: null, hasOlder: false, isRunning: true, runState: 'running', lastError: null, partial: null };
  const view = render(<Transcript {...props} events={events} page={page} />);
  const groups = () => screen.getAllByRole('button', { name: /вызов.*инструментов/ });
  expect(groups().map(button => button.getAttribute('aria-expanded'))).toEqual(['false', 'true']);
  const updated = [...events, ev(4, 'tool_call')];
  view.rerender(<Transcript {...props} events={updated} page={{ ...page, events: updated }} />);
  expect(groups().map(button => button.getAttribute('aria-expanded'))).toEqual(['false', 'true']);
  fireEvent.click(groups()[1]);
  view.rerender(<Transcript {...props} events={[...updated]} page={{ ...page, events: updated }} />);
  expect(groups()[1]).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(groups()[1]);
  const next = [...updated, ev(5, 'assistant', 'Next check', { isFinalReply: false }), ev(6, 'tool_call')];
  view.rerender(<Transcript {...props} events={next} page={{ ...page, events: next }} />);
  expect(groups().map(button => button.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'true']);
  view.rerender(<Transcript {...props} events={next} page={{ ...page, events: next, isRunning: false }} />);
  expect(groups().map(button => button.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'false']);
});

it('opens an existing tail when work resumes and folds it after the final answer', () => {
  const events = history.slice(0, 4);
  const page = { agentId: 'a', events, olderBefore: null, hasOlder: false, isRunning: false, runState: 'idle', lastError: null, partial: null };
  const view = render(<Transcript {...props} events={events} page={page} />);
  const group = () => screen.getByRole('button', { name: '2 вызова инструментов' });
  expect(group()).toHaveAttribute('aria-expanded', 'false');
  view.rerender(<Transcript {...props} events={events} page={{ ...page, isRunning: true }} />);
  expect(group()).toHaveAttribute('aria-expanded', 'true');
  view.rerender(<Transcript {...props} events={[...events, ev(4, 'assistant', 'Done', { isFinalReply: true })]} page={{ ...page, isRunning: true }} />);
  expect(group()).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('Done')).toBeVisible();
});

it('groups the peer receipt immediately before a durable run with its tools and outgoing messages', () => {
  const incoming=ev(10,'user','',{agentMessage:{from:'ab',body:'request'},navigationEligible:false});
  const outgoing=ev(12,'agent_message_outgoing','',{outgoingAgentMessage:{to:'ab',body:'reply',status:'delivered'}});
  const events=[incoming,ev(11,'tool_call'),outgoing,ev(13,'assistant','Answer',{isFinalReply:true})];
  const runs=[{id:'peer-run',startIdx:11,endIdx:13,startedAt:11000,endedAt:13000,status:'completed' as const,answerIdx:13,hasInterleavedInput:false}];
  const turns=workTurns(events,false,runs);
  expect(turns).toHaveLength(1);
  expect(turns[0].events.map(event=>event.idx)).toEqual([10,11,12]);
  expect(processEntries(turns[0].events)).toHaveLength(1);
  render(<Transcript {...props} events={events} page={{isRunning:false,runs} as never} />);
  expect(screen.getByRole('button',{name:'1 вызов инструментов, 2 сообщения между агентами'})).toBeVisible();
});
it('does not carry a peer across a human prompt or assistant response before a durable run', () => {
  const incoming=ev(10,'user','',{agentMessage:{from:'ab',body:'request'},navigationEligible:false});
  const runs=[{id:'next',startIdx:12,endIdx:null,startedAt:12000,endedAt:null,status:'open' as const,answerIdx:null,hasInterleavedInput:false}];
  for (const boundary of [ev(11,'user','Human',{messageIdx:11}),ev(11,'assistant','Reply',{isFinalReply:true})]) {
    const turns=workTurns([incoming,boundary,ev(12,'tool_call')],true,runs);
    expect(turns.at(-1)!.events.map(event=>event.idx)).toEqual([12]);
  }
});
it('renders goal lifecycle as separate rows between tool groups inside the completed work group', () => {
  const events = [ev(0, 'user', 'Question', { messageIdx: 0 }), ev(1, 'tool_call', '', { name: 'read' }), ev(1.001, 'goal_transition', 'Ship it', { goalStatus: 'active', goalBeforeStatus: null }), ev(2, 'tool_call', '', { name: 'bash' }), ev(2.001, 'goal_transition', 'Ship it', { goalStatus: 'paused', goalBeforeStatus: 'active' }), ev(2.002, 'goal_transition', 'Ship it', { goalStatus: 'active', goalBeforeStatus: 'paused' }), ev(2.003, 'goal_transition', 'Ship it', { goalStatus: 'complete', goalBeforeStatus: 'active' }), ev(3, 'assistant', 'Done', { isFinalReply: true })];
  const entries = processEntries(workTurns(events, false)[0].events);
  expect(entries.map(entry => entry.kind)).toEqual(['process', 'message', 'process', 'message', 'message', 'message']);
  render(<Transcript {...props} events={events} />);
  expect(screen.getByRole('button', { name: 'Завершено' })).toBeInTheDocument();
  expect(screen.queryByText(/события цели/)).toBeNull();
  for (const label of ['Цель запущена', 'Цель на паузе', 'Цель возобновлена', 'Цель завершена']) expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
});
it('expands and collapses goal row details like other tool rows', () => {
  const events = [ev(0, 'user', 'Question', { messageIdx: 0 }), ev(1, 'tool_call', '', { name: 'read' }), ev(1.001, 'goal_transition', 'Ship it', { goalStatus: 'paused', goalBeforeStatus: 'active' }), ev(2, 'assistant', 'Done', { isFinalReply: true })];
  render(<Transcript {...props} events={events} />);
  const toggle = screen.getByRole('button', { name: /Цель на паузе/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/Статус: В работе → Пауза/)).toBeVisible();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

const reviewRef = { version: 1 as const, host: 'local', dir: '/repo', count: 2, ids: ['0190aaaa-0000-7000-8000-000000000001', '0190aaaa-0000-7000-8000-000000000002'] };
const review = (idx: number) => ev(idx, 'user', 'Git review comments for local:/repo (2)', { messageIdx: idx, gitReview: reviewRef, navigationEligible: false });
it('places a Git review card inside its durable run, outside tool groups, with mixed form and tool rows', () => {
  const runs = [{ id: 'review-run', startIdx: 11, endIdx: 14, startedAt: 11000, endedAt: 14000, status: 'completed' as const, answerIdx: 14, hasInterleavedInput: false }];
  const events = [ev(9, 'user', 'Earlier', { messageIdx: 9 }), review(10), ev(11, 'tool_call', '', { name: 'gitReviewComments' }), ev(12, 'input', '', { inputId: 'q1', kind: 'confirm' }), ev(13, 'tool_call', '', { name: 'gitResolveComment' }), ev(14, 'assistant', 'Fixed', { isFinalReply: true })];
  const turns = workTurns(events, false, runs);
  const run = turns.find(turn => turn.run?.id === 'review-run')!;
  expect(run.events[0].idx).toBe(10); expect(isGitReview(run.events[0])).toBe(true); expect(run.input).toBeUndefined();
  expect(processEntries(run.events)[0]).toMatchObject({ kind: 'message' });
  const view = render(<Transcript {...props} events={events} page={{ isRunning: false, runs } as never} />);
  const card = view.container.querySelector('[data-chat-flow-kind="git-review"]')!;
  expect(card).not.toBeNull(); expect(card.closest('.work-group')).not.toBeNull(); expect(card.closest('.process-group')).toBeNull();
  expect(view.container.querySelector('.message--user[data-event-idx="10"]')).toBeNull();
  expect(screen.getByRole('button', { name: /Git review · 2/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Завершено/ })).toHaveAttribute('aria-expanded', 'true');
});
it('starts legacy (run-less) work at a review card and folds it once completed on reload', () => {
  const events = [review(0), ev(1, 'tool_call', '', { name: 'gitReviewComments' }), ev(2, 'assistant', 'Done', { isFinalReply: true }), ev(3, 'user', 'Next', { messageIdx: 3 }), ev(4, 'assistant', 'Ok', { isFinalReply: true })];
  const turns = workTurns(events, false);
  expect(turns[0]).toMatchObject({ completeStart: true, status: 'completed', latest: false });
  expect(turns[0].input).toBeUndefined(); expect(turns[0].events.map(event => event.idx)).toEqual([0, 1]);
  const view = render(<Transcript {...props} events={events} />);
  const card = view.container.querySelector('[data-chat-flow-kind="git-review"]')!;
  expect(card.closest('.work-group')).not.toBeNull(); expect(card).not.toBeVisible();
  fireEvent.click(screen.getAllByRole('button', { name: /^Завершено/ })[0]);
  expect(card).toBeVisible();
});
it('keeps legacy full-text review messages and forged references as ordinary text', () => {
  expect(isGitReview(ev(1, 'user', 'Git review comments for local:/repo (1)', { messageIdx: 1 }))).toBe(false);
  expect(isGitReview(ev(1, 'user', 'x', { gitReview: reviewRef }))).toBe(false);
});
