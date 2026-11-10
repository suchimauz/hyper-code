import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Transcript } from '../components/mauzcode/Transcript';
import type { EventPage } from '../lib/mauzcode';
it('shows Thinking only with an explicit signal and removes it on transition', () => {
  const page: EventPage = { agentId: 'test', events: [], olderBefore: null, hasOlder: false, isRunning: true, runState: 'running', lastError: null, partial: null };
  const props = { agentId: 'test', events: [], hasOlder: false, loadingOlder: false, loadOlder: async () => {} };
  const view = render(<Transcript {...props} page={page} />);
  expect(screen.queryByRole('status', { name: 'Модель обдумывает ответ' })).toBeNull();
  view.rerender(<Transcript {...props} page={{ ...page, thinking: { startedAt: 1 } }} />);
  expect(screen.getByRole('status', { name: 'Модель обдумывает ответ' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /Thinking/ })).toBeNull();
  view.rerender(<Transcript {...props} page={{ ...page, thinking: null }} />);
  expect(screen.queryByRole('status', { name: 'Модель обдумывает ответ' })).toBeNull();
});

it('restores a persisted public summary without rendering private legacy text', () => {
  const props = { agentId: 'test', events: [{ idx: 1, ts: 1, type: 'thinking', text: 'private legacy text', publicSummary: 'Public summary', durationMs: 2300, thinkingStatus: 'completed' as const }], hasOlder: false, loadingOlder: false, loadOlder: async () => {}, page: null };
  const view = render(<Transcript {...props} />);
  expect(screen.getByText('Public summary')).toBeVisible();
  expect(screen.queryByText('private legacy text')).toBeNull();
  expect(screen.getByText('2 с')).toBeVisible();
  view.unmount(); render(<Transcript {...props} />);
  expect(screen.getByRole('button', { name: 'Обдумывание завершено' })).toHaveAttribute('aria-expanded', 'false');
});

