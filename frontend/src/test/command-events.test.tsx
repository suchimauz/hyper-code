import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { coalesceCommands } from '../components/mauzcode/commandEvents';
import { TranscriptMessage } from '../components/mauzcode/TranscriptMessage';
import { Transcript } from '../components/mauzcode/Transcript';
import type { ChatEvent } from '../lib/mauzcode';

const start: ChatEvent = { idx: 1, ts: 10, type: 'command_invocation', commandName: 'plan', commandText: '/plan', operationId: 'op1', requestId: 'r1', status: 'running', text: '/plan' };
const end: ChatEvent = { ...start, idx: 3, ts: 30, type: 'command_result', status: 'completed', text: 'Planning mode enabled' };
describe('real command events', () => {
  it('pairs operation IDs, preserving original index and unrelated commands', () => {
    const other = { ...start, idx: 2, operationId: 'op2' };
    expect(coalesceCommands([start, other, end])).toEqual([{ ...end, idx: 1, ts: 10 }, other]);
    expect(coalesceCommands([end])).toEqual([end]);
    expect(coalesceCommands([{ ...start, operationId: undefined }, { ...end, operationId: undefined }])).toHaveLength(2);
  });
  it('hides only explicitly linked planning duplicates, not historical mode events', () => {
    const historical: ChatEvent = { idx: 0, ts: 1, type: 'planning_mode', text: 'Planning enabled' };
    const matching = { ...historical, idx: 2, operationId: 'op1' };
    const unrelated = { ...historical, idx: 4, operationId: 'op2' };
    expect(coalesceCommands([historical, start, matching, end, unrelated])).toEqual([historical, { ...end, idx: 1, ts: 10 }, unrelated]);
  });
  it('renders one terminal row and no fake user bubble for bare controls', () => {
    const { container } = render(<Transcript agentId="a" events={[start, end]} page={null} hasOlder={false} loadingOlder={false} loadOlder={async () => {}} />);
    expect(container.querySelectorAll('.command-row')).toHaveLength(1);
    expect(container.querySelector('.message--user')).toBeNull();
    expect(screen.getByText('Planning mode enabled')).toBeVisible();
  });
  it('exposes running, failed and interrupted state and keeps multiline disclosure open on refresh', async () => {
    const view = render(<TranscriptMessage agentId="a" event={start} />);
    expect(screen.getByRole('status')).toHaveTextContent('Выполняется');
    expect(view.container.querySelector('.command-row')).toHaveAttribute('aria-busy', 'true');
    const failed: ChatEvent = { ...end, status: 'failed', text: 'Provider unavailable\nTry again' };
    view.rerender(<TranscriptMessage agentId="a" event={failed} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ошибка');
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    expect(view.container.querySelector('pre')).toBeVisible();
    view.rerender(<TranscriptMessage agentId="a" event={{ ...failed }} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    view.rerender(<TranscriptMessage agentId="a" event={{ ...end, status: 'interrupted' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Прервано');
  });
  it('highlights only the explicit command token, reconstructing canonical user text', () => {
    const event: ChatEvent = { idx: 4, ts: 40, type: 'user', text: 'inspect /plan examples', command: { name: 'plan', text: '/plan inspect /plan examples', argsText: 'inspect /plan examples', operationId: 'op1' } };
    const view = render(<TranscriptMessage agentId="a" event={event} />);
    expect(view.container.querySelector('.user-message-bubble')).toHaveTextContent('/plan inspect /plan examples');
    expect(view.container.querySelectorAll('.user-command-token')).toHaveLength(1);
    expect(view.container.querySelector('.user-command-token')).toHaveTextContent('/plan');
    view.rerender(<TranscriptMessage agentId="a" event={{ ...event, command: 'plan' as unknown as ChatEvent['command'], text: 'historical task' }} />);
    expect(view.container.querySelector('.user-command-token')).toBeNull();
    expect(view.container).toHaveTextContent('historical task');
    view.rerender(<TranscriptMessage agentId="a" event={{ ...event, command: null, text: '/plan ordinary prose' }} />);
    expect(view.container.querySelector('.user-command-token')).toBeNull();
  });
});
