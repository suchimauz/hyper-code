import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CurrentAction } from '../components/hyper/CurrentAction';
import { ActiveToolRow } from '../components/hyper/ActiveToolRow';
import type { EventPage } from '../lib/hyper';
it('uses a single sweep for the whole tool text group', () => {
  const { container } = render(<ActiveToolRow run={{ id: 'one', name: 'bash', subject: 'bun test', startedAt: 1000, state: 'running', tail: '' }} />);
  expect(container.querySelectorAll('.tool-sweep-band')).toHaveLength(1);
  expect(container.querySelector('.tool-row-words')).toHaveTextContent('Bash');
  expect(container.querySelector('.tool-row-words')).toHaveTextContent('bun test');
});
it('shows whole-turn time without inventing an unknown start', () => {
  const spy = vi.spyOn(Date, 'now').mockReturnValue(65000);
  const page = { isRunning: true, turnStartedAt: 1000, activityStartedAt: 64000 } as EventPage;
  const view = render(<CurrentAction page={page} />);
  expect(screen.getByTitle('Время текущего хода, включая ожидание')).toHaveTextContent('1m4s');
  view.rerender(<CurrentAction page={{ ...page, turnStartedAt: null }} />);
  expect(screen.queryByTitle('Время текущего хода, включая ожидание')).toBeNull();
  spy.mockRestore();
});
it('opens the latest live tool and keeps action wording free of tool details', () => {
  const run = { id: 'one', name: 'bash', subject: 'secret-path/file.ts', startedAt: 1000, state: 'running' as const, tail: 'Progress output' };
  const view = render(<ActiveToolRow run={run} />);
  expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Progress output')).toBeVisible();
  view.rerender(<ActiveToolRow run={run} autoOpen={false} />);
  expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  view.rerender(<CurrentAction page={{ isRunning: true, activeTools: [run] } as EventPage} />);
  expect(screen.getByRole('status')).toHaveTextContent('Running tools…');
  expect(screen.queryByText(/secret-path/)).toBeNull();
});
