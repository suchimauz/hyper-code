import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AutomationTasks } from '../components/hyper/AutomationTasks';
import { cronSchedule, filterCronTasks, type CronTask } from '../lib/cronTasks';

const task = (over: Partial<CronTask>): CronTask => ({ name: 't', fn: 'mod.fn', args: {}, scheduleType: 'interval', everyMs: 300000, nextRunAt: Date.now() + 60000, enabled: true, state: 'idle', source: 'adhoc', sourceFile: null, lastStatus: 'done', lastStartedAt: null, lastFinishedAt: null, lastError: null, ...over });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
afterEach(() => vi.restoreAllMocks());

describe('Automation tasks', () => {
  it('formats real schedules and filters by status and text', () => {
    expect(cronSchedule({ scheduleType: 'interval', everyMs: 300000 })).toBe('Every 5m');
    expect(cronSchedule({ scheduleType: 'once', everyMs: null })).toBe('Once');
    const list = [task({ name: 'tick' }), task({ name: 'probe', fn: 'telegramBot.request', enabled: false })];
    expect(filterCronTasks(list, 'enabled', '').map(t => t.name)).toEqual(['tick']);
    expect(filterCronTasks(list, 'inactive', '').map(t => t.name)).toEqual(['probe']);
    expect(filterCronTasks(list, 'all', 'telegram').map(t => t.name)).toEqual(['probe']);
  });

  it('shows the dsh empty state and toggles a task through the CSRF bridge', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ tasks: [], csrfToken: 'x' }));
    const { unmount } = render(<AutomationTasks />);
    expect(await screen.findByText('No cron tasks yet.')).toBeTruthy();
    unmount();
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json({ tasks: [task({ name: 'tick' })], csrfToken: 'tok' })).mockResolvedValueOnce(json({ ok: true })).mockResolvedValue(json({ tasks: [task({ name: 'tick', enabled: false })], csrfToken: 'tok' }));
    render(<AutomationTasks />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Disable tick' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Enable tick' }).getAttribute('aria-checked')).toBe('false'));
    const [, init] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'tick', action: 'disable' });
    expect((init?.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok');
  });

  it('creates a cron task through the CSRF bridge', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [], csrfToken: 'tok' }), { headers: { 'content-type': 'application/json' } })).mockResolvedValue(new Response(JSON.stringify({ ok: true, tasks: [], csrfToken: 'tok' }), { headers: { 'content-type': 'application/json' } }));
    render(<AutomationTasks />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add task' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'nightly' } });
    fireEvent.change(screen.getByLabelText('Function'), { target: { value: 'skill.uptime' } });
    fireEvent.change(screen.getByLabelText('Every'), { target: { value: '1h' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    const [, init] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(String(init?.body))).toEqual({ action: 'add', name: 'nightly', fn: 'skill.uptime', every: '1h', args: {}, now: false });
  });
});
