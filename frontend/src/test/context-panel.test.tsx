import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextDetailsPanel } from '../components/hyper/ContextDetailsPanel';
it('retains future statistics sections without fabricated metrics', () => {
  render(<ContextDetailsPanel budget={null} details={null} />);
  for (const text of ['System prompt','Tool definitions','Messages','Session statistics','LLM time','Tool time','Avg time to first token (TTFT)','Tokens per second (TPS)','Token usage','Cache hit','Uncached input','Cached input','Output']) expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.queryByText('0 tok/s')).toBeNull();
});
it('shows provider-backed usage exactly and falls back to an approximate estimate', () => {
  const base = { estimatedTokens: 56000, contextWindow: 200000, mode: 'full' as const, fallback: null, lastReportedTokens: 96000 };
  const view = render(<ContextDetailsPanel budget={{ ...base, usedTokens: 100000, usedSource: 'provider' }} details={null} />);
  expect(screen.getByText('50%')).toBeInTheDocument();
  expect(screen.getByText('100K / 200K')).toBeInTheDocument();
  view.rerender(<ContextDetailsPanel budget={{ ...base, usedTokens: 56000, usedSource: 'estimate' }} details={null} />);
  expect(screen.getByText('~56K / 200K')).toBeInTheDocument();
  view.rerender(<ContextDetailsPanel budget={base} details={null} />);
  expect(screen.getByText('28%')).toBeInTheDocument();
});
