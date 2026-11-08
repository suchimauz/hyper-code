import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TranscriptMessage } from '../components/hyper/TranscriptMessage';
import { ProcessGroup } from '../components/hyper/WorkGroups';
import { processEntries, workTurns } from '../components/hyper/transcriptGroups';
import type { ChatEvent } from '../lib/hyper';
const peer: ChatEvent = { idx: 3, ts: 1700000000000, type: 'user', text: '<agent-message>envelope</agent-message>', messageIdx: 9, navigationEligible: false, author: {id:'agent:ab',agentId:'ab',kind:'agent',hue:120,name:'Research',initials:'AB'}, agentMessage: {from:'ab',title:'Research',body:'Exact original\nsecond line'} };
it('uses a collapsed tool-style row, revealing only the message body on click', () => {
  const {container} = render(<TranscriptMessage event={peer} agentId="owner" />);
  const card=container.querySelector('.agent-message')!;
  expect(card).toHaveAttribute('data-direction','incoming');
  expect(card).toHaveClass('tool-row');
  expect(card).toHaveStyle('--agent-hue: 120');
  expect(card.querySelector('strong.agent-message-id')).toHaveTextContent('ab');
  expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(/Exact original/)).toBeNull();
  expect(container.querySelector('.user-message-bubble')).toBeNull();
  expect(screen.queryByText(/envelope/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'От агента ab Research' }));
  expect(container.querySelector('.agent-message-body pre')?.textContent).toBe('Exact original\nsecond line');
  expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button'));
  expect(screen.queryByText(/Exact original/)).toBeNull();
});
it('shows destination and outgoing delivery status on expansion', () => {
  const event:ChatEvent={idx:4,ts:peer.ts,type:'agent_message_outgoing',text:null,peerAuthor:peer.author,outgoingAgentMessage:{to:'ab',title:'Research',body:'Reply',status:'delivered'}};
  const {container}=render(<TranscriptMessage event={event} agentId="owner" />);
  expect(container.querySelector('.agent-message')).toHaveAttribute('data-direction','outgoing');
  expect(container.querySelector('.agent-message')).toHaveStyle('--agent-hue: 120');
  expect(screen.getByRole('button', { name: 'Агенту ab Research' })).toBeVisible();
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText(/Отправлено/)).toBeVisible();
  expect(screen.getByText('Reply')).toBeVisible();
});
it('never starts a human work turn on incoming peer traffic', () => {
  const turns=workTurns([{idx:0,ts:1,type:'user',text:'Human',messageIdx:0},peer],false);
  expect(turns).toHaveLength(1);
  expect(turns[0].input?.text).toBe('Human');
});
it('groups incoming and outgoing traffic with tools and thoughts and counts each category', () => {
 const events: ChatEvent[] = [
  {idx:1,ts:1,type:'thinking',text:null}, {idx:2,ts:1,type:'tool_call',name:'read',text:null}, peer,
  {idx:4,ts:1,type:'agent_message_outgoing',text:null,outgoingAgentMessage:{to:'ab',body:'reply',status:'delivered'}},
 ];
 const entries=processEntries(events);
 expect(entries).toHaveLength(1);
 expect(entries[0].kind).toBe('process');
 render(<ProcessGroup events={events}><span>contents</span></ProcessGroup>);
 expect(screen.getByRole('button', {name:'1 обдумывание, 1 вызов инструментов, 2 сообщения между агентами'})).toHaveAttribute('aria-expanded','false');
});
it('groups a standalone peer message but keeps a human prompt outside the process group', () => {
 const human:ChatEvent={idx:5,ts:1,type:'user',text:'Human',messageIdx:5};
 expect(processEntries([peer,human,peer]).map(entry=>entry.kind)).toEqual(['process','message','process']);
 render(<ProcessGroup events={[peer]}><span>peer</span></ProcessGroup>);
 expect(screen.getByRole('button',{name:'1 сообщение между агентами'})).toBeVisible();
});
