import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextDetailsPanel } from '../components/hyper/ContextDetailsPanel';
it('retains future statistics sections without fabricated metrics', () => {
  render(<ContextDetailsPanel budget={null} details={null} />);
  for (const text of ['System prompt','Tool definitions','Messages','Session statistics','LLM time','Tool time','Avg time to first token (TTFT)','Tokens per second (TPS)','Token usage','Cache hit','Uncached input','Cached input','Output']) expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.queryByText('0 tok/s')).toBeNull();
});
