import { expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TranscriptMessage } from '../components/mauzcode/TranscriptMessage';
import type { ChatEvent } from '../lib/mauzcode';

const advisory = 'Planning mode enabled (advisory, not a sandbox)';
it.each([
  ['planning_mode', advisory, 'Planning mode enabled'],
  ['planning_mode', 'Planning mode disabled', 'Planning mode disabled'],
  ['planning_proposal', 'Plan ready for review', 'Plan ready for review'],
  ['planning_proposal', 'Plan approved', 'Plan approved'],
  ['command_result', advisory, 'Planning mode enabled'],
])('renders %s: %s as a plan row', (type, text, expected) => {
  const event: ChatEvent = { idx: 4, ts: 40, type, text, ...(type === 'command_result' ? { commandName: 'plan', status: 'completed' } : {}) };
  const { container } = render(<TranscriptMessage agentId="a" event={event} />);
  expect(container.querySelectorAll('.command-row')).toHaveLength(1);
  expect(container.querySelector('.command-row-name')).toHaveTextContent('plan');
  expect(container.querySelector('.command-row-summary')?.textContent).toBe(expected);
  expect(container.querySelector('.transcript-notice')).toBeNull();
  expect(event.text).toBe(text);
});
it.each(['user', 'assistant', 'command_result'])('preserves advisory text in unrelated %s content', type => {
  const { container } = render(<TranscriptMessage agentId="a" event={{ idx: 1, ts: 1, type, text: advisory, commandName: 'other' }} />);
  expect(container).toHaveTextContent(advisory);
});
it('keeps empty planning notices hidden', () => {
  const { container } = render(<TranscriptMessage agentId="a" event={{ idx: 1, ts: 1, type: 'planning_mode', text: '' }} />);
  expect(container).toBeEmptyDOMElement();
});
