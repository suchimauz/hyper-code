import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TasksPage, tasksExtension } from '../ui-plugins/tasks';
const task = { id: '00000000-0000-0000-0000-000000000001', description: 'Review code\nKeep the details', status: 'todo', agentId: null, workspaceMode: 'isolated', workspaceDir: null, createdAt: 1, updatedAt: 1 };
const context = { agentId: null, theme: 'light' as const, readOnly: false };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => { vi.restoreAllMocks(); history.replaceState(null, '', '/'); });
describe('native Tasks extension', () => {
  it('declares the host registration key and reads/searches without mutation or HTML embedding', async () => {
    expect(tasksExtension.id).toBe('tasks'); expect(tasksExtension.pages?.[0].id).toBe('overview');
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ tasks: [task], csrfToken: 'csrf' }));
    const view = render(<TasksPage context={context} />);
    expect(await screen.findByText('Review code')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing' } });
    expect(screen.getByText('No matching tasks.')).toBeTruthy();
    expect(view.container.querySelector('iframe')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1]?.method).toBe('GET');
  });
  it('starts only on explicit click with the cookie-bound token and exposes attached chat', async () => {
    history.replaceState(null, '', '/?view=extension:tasks/overview&task=' + task.id);
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => options?.method === 'POST' ? json({ task: { ...task, agentId: 'ab', status: 'running' } }) : json({ task, csrfToken: 'csrf' }));
    render(<TasksPage context={context} />);
    const start = await screen.findByRole('button', { name: 'Start agent' });
    expect(fetch).toHaveBeenCalledTimes(1); fireEvent.click(start);
    expect(await screen.findByRole('link', { name: 'Open attached chat ab' })).toHaveAttribute('href', '/agent/ab');
    expect(fetch.mock.calls[1][0]).toBe('/tasks/' + task.id + '/start');
    expect(new Headers(fetch.mock.calls[1][1]?.headers).get('X-CSRF-Token')).toBe('csrf');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('creates task JSON without starting an agent', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => options?.method === 'POST' ? json({ task }, 201) : url === '/tasks' ? json({ tasks: [], csrfToken: 'csrf' }) : json({ task, csrfToken: 'csrf' }));
    render(<TasksPage context={context} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'New task' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Review code' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await screen.findByRole('button', { name: 'Start agent' });
    const writes = fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST');
    expect(writes).toHaveLength(1); expect(writes[0][0]).toBe('/tasks');
    expect(JSON.parse(writes[0][1]?.body as string)).toEqual({ description: 'Review code', workspaceMode: 'default' });
  });
  it('honors read-only context and reports denied access without write retry', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ error: 'denied' }, 403));
    render(<TasksPage context={{ ...context, readOnly: true }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
    expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
