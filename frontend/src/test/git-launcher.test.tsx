import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@mauzcode/ui', async () => ({ ...await vi.importActual<typeof import('@mauzcode/ui')>('@mauzcode/ui'), requestJson: vi.fn() }));
// Same React/react-diff-view mapping as git-extension.test.tsx: the plugin bundle shares the host React.
vi.mock('../../../plugins/git/node_modules/react-diff-view/es/index.js', async () => await vi.importActual('../../../plugins/git/node_modules/react-diff-view/src/index.ts'));
vi.mock('../../../plugins/git/node_modules/react-diff-view/cjs/index.js', async () => await vi.importActual('../../../plugins/git/node_modules/react-diff-view/src/index.ts'));
vi.mock('../../../plugins/git/node_modules/react/index.js', async () => await vi.importActual('react'));
vi.mock('../../../plugins/git/node_modules/react/jsx-runtime.js', async () => await vi.importActual('react/jsx-runtime'));
vi.mock('../../../plugins/git/node_modules/react/jsx-dev-runtime.js', async () => await vi.importActual('react/jsx-dev-runtime'));
const pluginUi = vi.hoisted(() => ({ state: null as any }));
vi.mock('../extensions/pluginRuntime', () => ({ usePluginUi: () => pluginUi.state }));
import { ApiError, requestJson } from '@mauzcode/ui';
import git, { openRepository } from '../../../plugins/git/ui';
import { CanvasPanel } from '../components/mauzcode/CanvasPanel';
import { createExtensionRegistry } from '../extensions/registry';

const request = vi.mocked(requestJson);
const ctx = { agentId: 'ab', theme: 'light' as const, readOnly: false };
const props = { agentId: 'ab', revision: '1', theme: 'light' as const, onClose: vi.fn(), expanded: false, onExpand: vi.fn() };
const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const unrelated = { id: 3, title: 'Notes', icon: 'file-text', active: true };
let items: Record<string, unknown>[] = [];
const launcher = () => document.querySelector<HTMLButtonElement>('.canvas-start-entry[data-launcher="git/git"]')!;

beforeEach(() => {
  request.mockReset(); items = [];
  pluginUi.state = { registry: createExtensionRegistry([git], { git: { canvasKinds: ['gitUi.repository'], canvasLaunchers: ['git'] } }, { git: 'ph-git-branch' }), applications: {}, errors: {}, loaded: true };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items })));
});
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

describe('Git one-step Canvas launcher', () => {
  it('registers the public open callback instead of a component launcher', () => {
    const [entry] = pluginUi.state.registry.canvasLaunchers;
    expect(entry).toMatchObject({ key: 'git/git', title: 'Git', open: openRepository });
    expect(entry.component).toBeUndefined();
  });

  it('POSTs only the agent to the authorized endpoint and returns the final item ID', async () => {
    request.mockResolvedValueOnce({ id: 41, kind: 'gitUi.repository', args: { dir: '/home/dev/app', host: 'dev-box' } });
    await expect(openRepository(ctx)).resolves.toEqual({ id: 41 });
    // No browser-supplied host or directory: the server derives and pins the chat workspace target.
    expect(request).toHaveBeenCalledExactlyOnceWith('/gitUi?agentId=ab', { method: 'POST', body: {} });
  });

  it('shares one in-flight request across concurrent activation and allows a later repeat', async () => {
    const d = deferred<{ id: number }>(); request.mockReturnValueOnce(d.promise as never);
    const a = openRepository(ctx), b = openRepository(ctx);
    expect(b).toBe(a); expect(request).toHaveBeenCalledTimes(1);
    d.resolve({ id: 7 }); await expect(Promise.all([a, b])).resolves.toEqual([{ id: 7 }, { id: 7 }]);
    request.mockResolvedValueOnce({ id: 7 });
    await expect(openRepository(ctx)).resolves.toEqual({ id: 7 }); expect(request).toHaveBeenCalledTimes(2);
  });

  it('rejects without retrying or substituting another target', async () => {
    await expect(openRepository({ ...ctx, agentId: null })).rejects.toThrow('Open Git from an agent chat.');
    expect(request).not.toHaveBeenCalled();
    request.mockRejectedValueOnce(new ApiError('Invalid pinned repository', 400));
    await expect(openRepository(ctx)).rejects.toThrow('Invalid pinned repository');
    request.mockResolvedValueOnce({ error: 'nothing' });
    await expect(openRepository(ctx)).rejects.toThrow('Git did not return a repository tab.');
    expect(request).toHaveBeenCalledTimes(2);
    for (const [url, o] of request.mock.calls) { expect(url).toBe('/gitUi?agentId=ab'); expect(o).toEqual({ method: 'POST', body: {} }); }
  });

  it('turns Start into exactly one repository tab, ignoring clicks while opening, and keeps unrelated tabs', async () => {
    items = [unrelated];
    const d = deferred<{ id: number }>(); request.mockReturnValueOnce(d.promise as never);
    render(<CanvasPanel {...props} />);
    await screen.findByRole('tab', { name: 'Notes' });
    // The shell's own Start page (drawn before the first sync) is the one that becomes the Git tab.
    fireEvent.click(screen.getByRole('tab', { name: 'Start' }));
    await waitFor(() => expect(launcher()).not.toBeNull());
    fireEvent.click(launcher()); fireEvent.click(launcher()); fireEvent.click(launcher());
    expect(launcher()).toBeDisabled(); expect(request).toHaveBeenCalledTimes(1);
    items = [{ ...unrelated, active: false }, { id: 41, title: 'Git · app', icon: 'git-branch', active: true }];
    d.resolve({ id: 41 });
    await waitFor(() => expect(screen.getAllByRole('tab').map(t => t.getAttribute('title'))).toEqual(['Notes', 'Git · app']));
    expect(screen.getByRole('tab', { name: 'Git · app' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Start' })).toBeNull(); expect(screen.queryByRole('tab', { name: 'Git' })).toBeNull();
    expect(document.querySelector('.canvas-launcher-page')).toBeNull();
  });

  it('keeps an opening error on Start without a local, placeholder or orphan tab', async () => {
    request.mockRejectedValueOnce(new ApiError('Agent is unavailable', 403));
    render(<CanvasPanel {...props} />);
    await waitFor(() => expect(launcher()).not.toBeNull());
    fireEvent.click(launcher());
    expect(await screen.findByRole('alert')).toHaveTextContent('Agent is unavailable');
    expect(screen.getAllByRole('tab').map(t => t.getAttribute('title'))).toEqual(['Start']);
    expect(document.querySelector('.canvas-launcher-page')).toBeNull(); expect(launcher()).not.toBeDisabled();
  });
});
