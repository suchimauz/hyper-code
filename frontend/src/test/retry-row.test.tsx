import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RetryRow } from '../components/hyper/RetryRow';
import { TranscriptMessage } from '../components/hyper/TranscriptMessage';
import type { ChatEvent } from '../lib/hyper';

const base: ChatEvent = { idx: 7, ts: Date.now(), type: 'llm_retry', text: null, retryId: 'r1', retry: 2, maxRetries: 5, retryMode: 'normal', delayMs: 8000, failureCode: 'SSH_TRANSPORT', failureMessage: 'connection reset', provider: 'ssh/aeza', retryState: 'scheduled' };

describe('model retry row', () => {
  it('shows attempt, maximum and live countdown while scheduled', () => {
    render(<RetryRow event={base} />);
    expect(screen.getByText('retry 2/5')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Повтор через [78] с · SSH_TRANSPORT/);
  });
  it('uses infinity for always mode and terminal labels', () => {
    const view = render(<RetryRow event={{ ...base, retryMode: 'always', maxRetries: null, retryState: 'started' }} />);
    expect(screen.getByText('retry 2/∞')).toBeInTheDocument();
    expect(screen.getByText(/Повтор запущен/)).toBeInTheDocument();
    view.rerender(<RetryRow event={{ ...base, retryState: 'cancelled' }} />);
    expect(screen.getByText(/Повтор отменён/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('expands failure details', async () => {
    render(<RetryRow event={base} />);
    expect(screen.queryByText(/connection reset/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry 2\/5/ }));
    expect(screen.getByText(/connection reset/)).toBeVisible();
  });
  it('is routed from the transcript, not rendered as an assistant message', () => {
    const { container } = render(<TranscriptMessage event={base} agentId="ab" />);
    expect(container.querySelector('.retry-row')).not.toBeNull();
    expect(container.querySelector('.message--assistant')).toBeNull();
  });
});

describe('retry state across incremental pages', async () => {
  const { mergeTail, settleRetries } = await import('../lib/hyper');
  const row = { ...base, idx: 3, retryState: 'scheduled' as const };
  it('marks an off-page scheduled retry started when model output follows', () => {
    const page = { olderBefore: 4, events: [{ idx: 4, ts: 2, type: 'thinking', text: null }] } as unknown as import('../lib/hyper').EventPage;
    expect(mergeTail([row], page)[0]!.retryState).toBe('started');
  });
  it('marks it started by the next attempt and cancelled by stop', () => {
    expect(settleRetries([row, { ...row, idx: 5, retry: 3 }]).map(e => e.retryState)).toEqual(['started', 'scheduled']);
    expect(settleRetries([row, { idx: 6, ts: 3, type: 'stop', text: null }])[0]!.retryState).toBe('cancelled');
    expect(settleRetries([row, { idx: 6, ts: 3, type: 'error', text: 'stopped by user; queue cleared' }])[0]!.retryState).toBe('cancelled');
    expect(settleRetries([row, { idx: 6, ts: 3, type: 'error', text: 'SSH_TRANSPORT: retries exhausted' }])[0]!.retryState).toBe('started');
  });
  it('keeps a pending retry and server-resolved state untouched', () => {
    const events = [row, { idx: 4, ts: 2, type: 'user', text: 'hi' }];
    expect(settleRetries(events)).toBe(events);
    expect(settleRetries([{ ...row, retryState: 'cancelled' }, { idx: 4, ts: 2, type: 'assistant', text: 'x' }])[0]!.retryState).toBe('cancelled');
  });
});
