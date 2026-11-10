import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompactionRow } from '../components/hyper/CompactionRow';
import { coalesceCompactions } from '../components/hyper/compactionEvents';
import type { ChatEvent } from '../lib/hyper';
const start: ChatEvent = { idx: 3, ts: 10, type: 'compaction_start', revision: 2, text: null };
const end: ChatEvent = { idx: 5, ts: 20, type: 'compaction_completed', revision: 2, text: null, summary: 'Summary body', tokensBefore: 3000, tokensAfter: 500 };
describe('compaction history lifecycle', () => {
  it('updates at original position without duplicate rows', () => {
    const other: ChatEvent = { idx: 4, ts: 15, type: 'assistant', text: 'After' };
    expect(coalesceCompactions([start, other, end])).toEqual([{ ...end, idx: 3, ts: 10 }, other]);
    expect(coalesceCompactions([end])).toEqual([end]);
  });
  it('never joins unknown revisions', () => {
    expect(coalesceCompactions([{ ...start, revision: null }, { ...end, revision: null }])).toHaveLength(2);
  });
  it('replaces running text with expandable completed summary', async () => {
    const user = userEvent.setup();
    const view = render(<CompactionRow event={start} />);
    expect(screen.getByRole('status')).toHaveTextContent('Сжимаем контекст…');
    view.rerender(<CompactionRow event={end} />);
    expect(screen.queryByText('Сжимаем контекст…')).not.toBeInTheDocument();
    expect(screen.queryByText('Summary body')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /compact/ }));
    expect(screen.getByText('Summary body')).toBeVisible();
  });
  it('exposes failure details without assistant author decoration', async () => {
    render(<CompactionRow event={{ ...end, type: 'compaction_failed', text: 'Provider unavailable' }} />);
    await userEvent.click(screen.getByRole('button', { name: /Не удалось/ }));
    expect(screen.getByText('Provider unavailable')).toBeVisible();
  });
  it('shows provider-measured before as exact and after as an estimate', () => {
    // No explanatory suffix: the tilde alone marks the estimate.
    render(<CompactionRow event={{ ...end, tokensBefore: 130051, tokensAfter: 42000, tokensBeforeSource: 'provider', tokensAfterEstimated: true }} />);
    expect(screen.getByRole('button', { name: /compact/ })).toHaveTextContent(`${(130051).toLocaleString()} → ~${(42000).toLocaleString()} токенов`);
    expect(screen.getByRole('button', { name: /compact/ })).not.toHaveTextContent(`~${(130051).toLocaleString()}`);
    expect(screen.getByRole('button', { name: /compact/ })).not.toHaveTextContent('оценка');
  });
  it('keeps both counts approximate for estimated or legacy events', () => {
    render(<CompactionRow event={end} />);
    expect(screen.getByRole('button', { name: /compact/ })).toHaveTextContent(`~${(3000).toLocaleString()} → ~${(500).toLocaleString()} токенов`);
  });
});
