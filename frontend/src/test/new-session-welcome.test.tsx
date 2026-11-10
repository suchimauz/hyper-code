import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NewSessionWelcome } from '../components/mauzcode/NewSessionWelcome';
import { compactCount, heatmapDays, type WelcomeStats } from '../lib/welcomeStats';

const stats: WelcomeStats = { range: 'all', timezone: 'UTC', asOf: '2026-06-21T10:00:00Z', sessions: 12, messages: 9876, totalTokens: 1250000, activeDays: 3, peakHour: 22, favoriteModel: 'test-model', models: [{ model: 'test-model', messages: 9876, totalTokens: 1250000, inputTokens: 1000000, outputTokens: 250000 }], daily: [{ date: '2026-06-21', messages: 9876, sessions: 12, totalTokens: 1250000, models: [{ model: 'test-model', totalTokens: 1250000 }] }] };
function respond(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('NewSessionWelcome', () => {
  it('reads real statistics without creating a session and uses the navigation brand', async () => {
    const fetcher = vi.fn().mockResolvedValue(respond(stats)); vi.stubGlobal('fetch', fetcher);
    const { container } = render(<NewSessionWelcome userName="suchimauz" />);
    expect(screen.getByRole('heading', { name: "What's up next, suchimauz?" })).toBeInTheDocument();
    expect(container.querySelector('.brand-mark')).toHaveTextContent('h');
    expect(await screen.findByText('9,876')).toBeInTheDocument();
    expect(screen.getByText('1.3M')).toBeInTheDocument();
    expect(screen.getByText('10 PM')).toBeInTheDocument();
    expect(container.querySelectorAll('.welcome-heat-cell')).toHaveLength(182);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/ui-lab-api/stats?range=all&timezone=UTC');
    expect(fetcher.mock.calls[0][1].method).toBeUndefined();
  });
  it('switches time ranges and model view with genuine token splits', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(respond(stats))); vi.stubGlobal('fetch', fetcher);
    render(<NewSessionWelcome userName="A" />); await screen.findByText('9,876');
    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    await waitFor(() => expect(fetcher.mock.calls.at(-1)?.[0]).toContain('range=7d'));
    fireEvent.click(screen.getByRole('button', { name: 'Models' }));
    expect(await screen.findByText('1M in · 250k out')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });
  it('keeps unavailable measurements distinct from zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ ...stats, totalTokens: null, favoriteModel: null, peakHour: null, messages: 0 })));
    render(<NewSessionWelcome userName="" />); await screen.findByText('0');
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.getByRole('heading')).toHaveTextContent("What's up next?");
  });
  it('shows an error and retries without invented data', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(respond({ error: 'Forbidden' }, 403)).mockResolvedValueOnce(respond(stats)); vi.stubGlobal('fetch', fetcher);
    render(<NewSessionWelcome userName="A" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
    expect(screen.queryByText('9,876')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('9,876')).toBeInTheDocument();
  });
  it('aborts an outstanding request on unmount', () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}); }));
    const view = render(<NewSessionWelcome userName="A" />); view.unmount(); expect(signal?.aborted).toBe(true);
  });
  it('retains the cached range while revalidating and keeps numbers on a background error', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(respond(stats)).mockResolvedValueOnce(respond({ ...stats, range: '7d', messages: 7 })).mockRejectedValueOnce(new Error('Offline'));
    vi.stubGlobal('fetch', fetcher); render(<NewSessionWelcome userName="A" />);
    await screen.findByText('9,876'); fireEvent.click(screen.getByRole('button', { name: '7d' })); await screen.findByText('7');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('9,876')).toBeInTheDocument();
    await screen.findByRole('alert'); expect(screen.getByText('9,876')).toBeInTheDocument();
  });
  it('shows stale data immediately with an updating label, not a blank skeleton', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ ...stats, refreshing: true })));
    render(<NewSessionWelcome userName="A" />); await screen.findByText('9,876');
    expect(screen.getByText(/Updating/)).toBeInTheDocument(); expect(screen.queryByLabelText('Loading statistics')).not.toBeInTheDocument();
  });
  it('clears retained data on authorization loss', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(respond(stats)).mockResolvedValueOnce(respond({ error: 'Unauthorized' }, 401));
    vi.stubGlobal('fetch', fetcher); render(<NewSessionWelcome userName="A" />);
    await screen.findByText('9,876'); fireEvent.click(screen.getByRole('button', { name: '7d' }));
    await screen.findByRole('alert'); expect(screen.queryByText('9,876')).not.toBeInTheDocument();
  });
  it('uses endpoint UTC date and never fabricates token coverage in empty days', () => {
    const days = heatmapDays(stats); expect(days).toHaveLength(182); expect(days.at(-1)?.date).toBe('2026-06-21');
    expect(days[0].totalTokens).toBeNull(); expect(days.at(-1)?.messages).toBe(9876);
    expect(compactCount(null)).toBe('—'); expect(compactCount(0)).toBe('0');
  });
});
