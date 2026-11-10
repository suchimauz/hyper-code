import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ActiveToolRow } from '../components/mauzcode/ActiveToolRow';
import { ToolRow } from '../components/mauzcode/ToolRow';
import { formatToolDuration, ToolTiming } from '../components/mauzcode/ToolTiming';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const run = { id: 'eval-1', name: 'tools_eval', subject: 'await longTask()', startedAt: 1000, state: 'running' as const, tail: '' };
it('updates elapsed time while waiting for eval output, including collapsed and stopping rows', () => {
  vi.useFakeTimers(); vi.setSystemTime(3000);
  const { rerender, unmount } = render(<ActiveToolRow run={run} autoOpen={false} />);
  expect(screen.getByText('2.0 с')).toBeVisible();
  expect(screen.queryByText(/таймаут/)).toBeNull();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByText('4.0 с')).toBeVisible();
  rerender(<ActiveToolRow run={{ ...run, state: 'stopping', timeoutMs: 60000 }} autoOpen={false} />);
  expect(screen.getByText('4.0 с · таймаут 1 мин 0 с')).toBeVisible();
  expect(screen.getByText('Останавливается')).toBeInTheDocument();
  unmount(); expect(vi.getTimerCount()).toBe(0);
});
it('preserves measured duration on completed eval without loading details or ticking', () => {
  vi.useFakeTimers();
  render(<ToolRow agentId="fixture" event={{ idx: 1, ts: 1000, type: 'tool_call', name: 'tools_eval', text: null, durationMs: 1234 }} />);
  expect(screen.getByText('1.2 с')).toBeVisible();
  act(() => vi.advanceTimersByTime(30000));
  expect(screen.getByText('1.2 с')).toBeVisible();
  expect(vi.getTimerCount()).toBe(0);
});
it('shows real timeout for failed completed tools, never guesses it for eval', () => {
  render(<ToolRow agentId="fixture" event={{ idx: 1, ts: 1000, type: 'tool_call', name: 'bash', text: null, durationMs: 60100, timeoutMs: 60000, isError: true }} />);
  expect(screen.getByText('1 мин 0 с · таймаут 1 мин 0 с')).toBeVisible();
});
it('omits unknown/invalid timing, accepts measured zero and clamps clock skew', () => {
  const { rerender, container } = render(<ToolTiming />);
  expect(container).toBeEmptyDOMElement();
  rerender(<ToolTiming durationMs={NaN} timeoutMs={-1} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<ToolTiming durationMs={0} />);
  expect(screen.getByText('0 мс')).toBeVisible();
  vi.useFakeTimers(); vi.setSystemTime(1000);
  rerender(<ToolTiming startedAt={2000} />);
  expect(screen.getByText('0 мс')).toBeVisible();
});
it('formats durations without wrapping minutes at an hour', () => {
  expect(formatToolDuration(42.7)).toBe('43 мс');
  expect(formatToolDuration(3661000)).toBe('61 мин 1 с');
});
