import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceDirectoryDialog } from '../components/mauzcode/WorkspaceDirectoryDialog';
import { directoryBreadcrumbs, type DirectoryListing } from '../lib/workspaceDirectories';
const listing = (path: string, entries: string[] = []): DirectoryListing => ({ path, parentPath: path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/', entries: entries.map(name => ({ name, path: `${path === '/' ? '' : path}/${name}` })), canCreate: true, csrfToken: 'test-csrf' });
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function mockBrowse(url: string) { const u = new URL(url, 'http://test'); const path = u.searchParams.get('path') || '/home'; return json(listing(path, path === '/home' ? ['project', ...(u.searchParams.get('showHidden') === 'true' ? ['.hidden'] : [])] : path === '/' ? ['home'] : [])); }
afterEach(() => vi.unstubAllGlobals());
it('shows two panes, toggles hidden directories and submits only an explicit Open', async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => init?.method === 'POST' ? json({ ok: true }) : mockBrowse(url)); vi.stubGlobal('fetch', fetcher);
  const onCreated = vi.fn(), onOpenChange = vi.fn();
  render(<WorkspaceDirectoryDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);
  await screen.findByRole('button', { name: 'project' });
  expect(screen.getByRole('region', { name: 'Directories in /' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Show hidden files' }));
  await screen.findByRole('button', { name: '.hidden' });
  fireEvent.click(screen.getByRole('button', { name: 'project' }));
  await screen.findByRole('region', { name: 'Directories in /home/project' });
  expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  const post = fetcher.mock.calls.find(([url]) => url === '/projects/action')!;
  expect(JSON.parse(String(post[1]?.body))).toEqual({ action: 'create', dir: '/home/project' });
  expect(post[1]?.headers).toMatchObject({ 'x-csrf-token': 'test-csrf' });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
it('edits paths, keeps Escape inside the editor, then closes with Escape', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => mockBrowse(url))); const onOpenChange = vi.fn();
  render(<WorkspaceDirectoryDialog open onOpenChange={onOpenChange} onCreated={vi.fn()} />);
  await screen.findByRole('button', { name: 'project' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit directory path' }));
  expect(screen.getByRole('textbox', { name: 'Directory path' })).toHaveFocus();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '/other' } });
  fireEvent.submit(screen.getByRole('textbox').closest('form')!);
  await screen.findByRole('region', { name: 'Directories in /other' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit directory path' }));
  await userEvent.keyboard('{Escape}'); expect(screen.queryByRole('textbox')).toBeNull(); expect(onOpenChange).not.toHaveBeenCalled();
  await userEvent.keyboard('{Escape}'); expect(onOpenChange).toHaveBeenCalledWith(false);
});
it('creates a folder within the selected directory and selects it, not a workspace', async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => init?.method === 'POST' ? json({ path: '/home/new' }) : mockBrowse(url)); vi.stubGlobal('fetch', fetcher);
  render(<WorkspaceDirectoryDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />);
  await screen.findByRole('button', { name: 'project' }); fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Folder name' }), { target: { value: 'new' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  await screen.findByRole('region', { name: 'Directories in /home/new' });
  const post = fetcher.mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(post[0]).toBe('/ui-lab-api/directories'); expect(JSON.parse(String(post[1]?.body))).toEqual({ path: '/home', name: 'new' });
  expect(fetcher.mock.calls.some(([url]) => url === '/projects/action')).toBe(false);
});
it('aborts superseded requests and ignores stale responses', async () => {
  let resolveOld: ((response: Response) => void) | undefined; let oldSignal: AbortSignal | undefined;
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (new URL(url, 'http://test').searchParams.get('path') === '/home/project') { oldSignal = init?.signal as AbortSignal; return new Promise<Response>(resolve => { resolveOld = resolve; }); }
    return Promise.resolve(mockBrowse(url));
  }));
  render(<WorkspaceDirectoryDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'project' }));
  await waitFor(() => expect(resolveOld).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: '/' }));
  await waitFor(() => expect(oldSignal?.aborted).toBe(true));
  resolveOld!(json(listing('/home/project', ['STALE'])));
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(screen.queryByRole('button', { name: 'STALE' })).toBeNull();
});
it('surfaces read errors and retries without any writes', async () => {
  let fails = true; vi.stubGlobal('fetch', vi.fn(async (url: string) => fails ? json({ error: 'Permission denied' }, 403) : mockBrowse(url)));
  render(<WorkspaceDirectoryDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied'); expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
  fails = false; fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await screen.findByRole('button', { name: 'project' });
});
it('builds navigable absolute breadcrumbs', () => { expect(directoryBreadcrumbs('/a/b/')).toEqual([{ name: '/', path: '/' }, { name: 'a', path: '/a' }, { name: 'b', path: '/a/b' }]); });
