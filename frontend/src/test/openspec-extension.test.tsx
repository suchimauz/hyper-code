import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const live = vi.hoisted(() => ({ onEvent: null as null | ((e: unknown) => void), resync: null as null | ((r: string) => void), onError: null as null | ((e: unknown) => void) }));
vi.mock('@mauzcode/ui', async () => ({
  ...await vi.importActual<typeof import('@mauzcode/ui')>('@mauzcode/ui'),
  requestJson: vi.fn(),
  useLiveSubscription: (o: { onEvent: (e: unknown) => void; resync: (r: string) => void; onError: (e: unknown) => void }) => { live.onEvent = o.onEvent; live.resync = o.resync; live.onError = o.onError; },
}));
import { requestJson } from '@mauzcode/ui';
import openspec, { Workspace, moveIndex, openWorkspace } from '../../../plugins/openspec/ui';
import { createExtensionRegistry } from '../extensions/registry';

const request = vi.mocked(requestJson);
let done = 1;
let hasDesign = true;
let archived = false;
const addX = (kind: string, name: string) => ({ name, mtime: 1, progress: { done, total: 3 }, artifacts: [{ id: kind + ':' + name + ':proposal', label: 'proposal.md' }, ...(hasDesign ? [{ id: kind + ':' + name + ':design', label: 'design.md' }] : [])] });
const snapshot = () => archived ? ({ initialized: true, key: 'k1', specs: [], archive: [addX('archive', '2026-11-12-add-x')], changes: [] }) : ({ initialized: true, key: 'k1', specs: [{ id: 'spec:auth', path: 'auth' }], archive: [],
  changes: [{ name: 'add-x', mtime: 1, progress: { done, total: 3 }, artifacts: [{ id: 'change:add-x:proposal', label: 'proposal.md' }, ...(hasDesign ? [{ id: 'change:add-x:design', label: 'design.md' }] : [])] },
    { name: 'fix-y', mtime: 1, progress: null, artifacts: [{ id: 'change:fix-y:proposal', label: 'proposal.md' }] }] });
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const item = (state: Record<string, unknown> = {}) => ({ id: 7, kind: 'openspec.workspace', args: { dir: '/w/proj' }, state });
const ctx = { agentId: 'ab', theme: 'dark' as const, readOnly: false };

beforeEach(() => {
  done = 1; hasDesign = true; archived = false; request.mockReset();
  request.mockImplementation(async (url: string) => {
    if (url.includes('op=snapshot')) return snapshot();
    if (url.includes('op=doc')) { const id = decodeURIComponent(url.split('id=')[1]); return { id, title: id, html: '<h1>' + id + '</h1>', mtime: 1 }; }
    if (url.includes('op=watch')) return { key: 'k1' };
    if (url.includes('op=validate')) return { ok: true, items: [{ id: 'add-x', type: 'change', valid: true, issues: [] }] };
    return {};
  });
});

describe('openspec plugin UI', () => {
  it('declares the granted launcher and canvas kind', () => {
    const registry = createExtensionRegistry([openspec], { openspec: { canvasKinds: ['openspec.workspace'], canvasLaunchers: ['openspec'] } }, { openspec: 'ph-list-checks' });
    expect(registry.canvasLaunchers.map(l => l.key)).toEqual(['openspec/openspec']);
    expect(registry.canvasLaunchers[0].open).toBe(openWorkspace);
  });

  it('opens the workspace tab in one server request', async () => {
    request.mockResolvedValueOnce({ id: 15 });
    await expect(openWorkspace(ctx)).resolves.toEqual({ id: 15 });
    expect(request).toHaveBeenCalledWith('/openspec?agentId=ab', { method: 'POST', body: {} });
    await expect(openWorkspace({ ...ctx, agentId: null })).rejects.toThrow('agent chat');
  });

  it('computes wrapping arrow navigation', () => {
    expect(moveIndex('ArrowRight', 2, 3, true)).toBe(0);
    expect(moveIndex('ArrowLeft', 0, 3, true)).toBe(2);
    expect(moveIndex('ArrowDown', 0, 3, false)).toBe(1);
    expect(moveIndex('End', 0, 3, false)).toBe(2);
    expect(moveIndex('ArrowDown', 0, 3, true)).toBeNull();
  });

  it('switches sections with arrow keys via a roving-tabindex tablist', async () => {
    render(<Workspace context={ctx} item={item()} />); await settle();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(t => t.tabIndex)).toEqual([0, -1, -1]);
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Specs' })).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Specs' }));
    expect(screen.getByRole('option', { name: /auth/ })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/canvas/ab/item/7', { method: 'POST', body: { state: { section: 'specs' } } });
  });

  it('moves through the listbox, opens a document and shows progress', async () => {
    render(<Workspace context={ctx} item={item()} />); await settle();
    const options = screen.getAllByRole('option');
    expect(screen.getAllByRole('progressbar')[0]).toHaveAttribute('aria-valuenow', '1');
    fireEvent.keyDown(options[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(options[0], { key: 'Enter' }); await settle();
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('article', { name: 'change:add-x:proposal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'design.md' })); await settle();
    expect(screen.getByRole('article', { name: 'change:add-x:design' })).toBeInTheDocument();
  });

  it('refreshes on a matching live event and reports removed documents', async () => {
    render(<Workspace context={ctx} item={item({ section: 'changes', selected: 'add-x', doc: 'change:add-x:design' })} />); await settle();
    expect(screen.getByRole('article', { name: 'change:add-x:design' })).toBeInTheDocument();
    done = 2; hasDesign = false;
    act(() => live.onEvent?.({ type: 'openspec.changed', key: 'other' })); await settle();
    expect(screen.getAllByRole('progressbar')[0]).toHaveAttribute('aria-valuenow', '1');
    act(() => live.onEvent?.({ type: 'openspec.changed', key: 'k1' })); await settle();
    expect(screen.getAllByRole('progressbar')[0]).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText('This document is no longer available.')).toBeInTheDocument();
  });

  it('reports validation in a status region', async () => {
    render(<Workspace context={ctx} item={item()} />); await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Validate' })); await settle();
    expect(screen.getAllByRole('status').some(s => s.textContent?.includes('All 1 items are valid.'))).toBe(true);
  });

  it('follows a selected change into the archive with the same artifact', async () => {
    render(<Workspace context={ctx} item={item({ section: 'changes', selected: 'add-x', doc: 'change:add-x:design' })} />); await settle();
    archived = true;
    act(() => live.onEvent?.({ type: 'openspec.changed', key: 'k1' })); await settle(); await settle();
    expect(screen.getByRole('tab', { name: 'Archive' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('article', { name: 'archive:2026-11-12-add-x:design' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/canvas/ab/item/7', { method: 'POST', body: { state: { section: 'archive', selected: '2026-11-12-add-x', doc: 'archive:2026-11-12-add-x:design' } } });
  });

  it('refreshes by hand and keeps the server watcher alive', async () => {
    render(<Workspace context={ctx} item={item()} />); await settle();
    const before = request.mock.calls.filter(([u]) => String(u).includes('op=snapshot')).length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); await settle();
    expect(request.mock.calls.filter(([u]) => String(u).includes('op=snapshot')).length).toBe(before + 1);
    expect(request.mock.calls.some(([u]) => String(u).includes('op=watch'))).toBe(true);
  });

  it('announces when live updates stop and recovers after resync', async () => {
    render(<Workspace context={ctx} item={item()} />); await settle();
    act(() => live.onError?.(new Error('down'))); await settle();
    expect(screen.getByText('Not live')).toBeInTheDocument();
    expect(screen.getAllByRole('status').some(s => s.textContent?.includes('Live updates are unavailable'))).toBe(true);
    act(() => live.resync?.('reconnect')); await settle();
    expect(screen.queryByText('Not live')).not.toBeInTheDocument();
  });

  it('shows Live when the transport is already connected before the tab mounts', async () => {
    const listeners: Array<(s: string) => void> = [];
    (window as unknown as { mauzcodeLive: unknown }).mauzcodeLive = { subscribe: () => () => {}, getStatus: () => 'connected', onStatus: (l: (s: string) => void) => { listeners.push(l); return () => {}; } };
    try {
      render(<Workspace context={ctx} item={item()} />); await settle();
      expect(screen.getByText('Live')).toBeInTheDocument();
      act(() => listeners.at(-1)?.('disconnected')); await settle();
      expect(screen.getByText('Not live')).toBeInTheDocument();
    } finally { delete (window as unknown as { mauzcodeLive?: unknown }).mauzcodeLive; }
  });

  it('picks up a transport script that loads after the tab mounted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Workspace context={ctx} item={item()} />); await settle();
      expect(screen.getByText('Connecting…')).toBeInTheDocument();
      (window as unknown as { mauzcodeLive: unknown }).mauzcodeLive = { subscribe: () => () => {}, getStatus: () => 'connected', onStatus: () => () => {} };
      await act(async () => { vi.advanceTimersByTime(3100); });
      expect(screen.getByText('Live')).toBeInTheDocument();
    } finally { vi.useRealTimers(); delete (window as unknown as { mauzcodeLive?: unknown }).mauzcodeLive; }
  });
});
