import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TranscriptMessage } from '../components/hyper/TranscriptMessage';

it('displays a structured user event without persisted HTML and never injects a historical shell', () => {
  const event = {idx: 4, ts: 1700000000000, type: 'user', text: 'The structured message'};
  const {container, rerender} = render(<TranscriptMessage agentId="fixture" event={event} />);
  expect(screen.getByText('The structured message')).toBeVisible();
  rerender(<TranscriptMessage agentId="fixture" event={{...event, html: '<div data-old-shell>Obsolete shell</div>'}} />);
  expect(screen.getByText('The structured message')).toBeVisible();
  expect(container.querySelector('[data-old-shell]')).toBeNull();
});

it('renders command and planning events from structured text, not generated cards', () => {
  const {rerender} = render(<TranscriptMessage agentId="fixture" event={{idx: 4, ts: 1, type: 'command_result', commandName: 'plan', text: 'Plan prepared', status: 'completed'}} />);
  expect(screen.getByText('Plan prepared')).toBeVisible();
  rerender(<TranscriptMessage agentId="fixture" event={{idx: 5, ts: 2, type: 'planning_proposal', text: 'Review the proposed steps'}} />);
  expect(screen.getByText('Review the proposed steps')).toBeVisible();
});
