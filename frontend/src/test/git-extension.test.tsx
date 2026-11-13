import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const live = vi.hoisted(() => ({ onEvent: null as null | ((e: unknown) => void), resync: null as null | ((r: string) => void), onError: null as null | ((e: unknown) => void), types: [] as string[] }));
vi.mock('@mauzcode/ui', async () => ({
  ...await vi.importActual<typeof import('@mauzcode/ui')>('@mauzcode/ui'),
  requestJson: vi.fn(),
  useLiveSubscription: (o: { types: string[]; onEvent: (e: unknown) => void; resync: (r: string) => void; onError: (e: unknown) => void }) => { live.onEvent = o.onEvent; live.resync = o.resync; live.onError = o.onError; live.types = o.types; },
}));
// The plugin's react-diff-view is externalized and would load the plugin's own peer-installed React copy. The
// runtime bundle maps react to the host shim; do the same here by inlining its TS source and pointing React at the host.
vi.mock('../../../plugins/git/node_modules/react-diff-view/es/index.js', async () => await vi.importActual('../../../plugins/git/node_modules/react-diff-view/src/index.ts'));
vi.mock('../../../plugins/git/node_modules/react-diff-view/cjs/index.js', async () => await vi.importActual('../../../plugins/git/node_modules/react-diff-view/src/index.ts'));
vi.mock('../../../plugins/git/node_modules/react/index.js', async () => await vi.importActual('react'));
vi.mock('../../../plugins/git/node_modules/react/jsx-runtime.js', async () => await vi.importActual('react/jsx-runtime'));
vi.mock('../../../plugins/git/node_modules/react/jsx-dev-runtime.js', async () => await vi.importActual('react/jsx-dev-runtime'));
import { requestJson } from '@mauzcode/ui';
import git, { Repository, parsePatch, extendRange, rangeText } from '../../../plugins/git/ui';
import { createExtensionRegistry } from '../extensions/registry';

const request = vi.mocked(requestJson);
const PATCH = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,6 +1,8 @@',
  ' const a = 1;', ' const b = 2;', '-const c = 3;', '+const c = 30;', '+const d = 4;', '+const e = 5;', ' const f = 6;', ' const g = 7;', ' const h = 8;', ''].join('\n');
type C = Record<string, unknown> & { id: string; status: string; sent_at: number | null };
let comments: C[] = [];
let files = [{ path: 'src/a.ts', group: 'unstaged', status: 'M' }];
let sendResult: () => Promise<unknown> = async () => ({ sent: 1 });
let snapshotImpl: ((url: string) => Promise<unknown> | unknown) | null = null;
const comment = (id: string, over: Partial<C> = {}): C => ({ id, path: 'src/a.ts', old_path: null, side: 'new', line_start: 2, line_end: 2, line_text: 'const b = 2;', scope: 'worktree', commit_hash: null, worktree_group: 'unstaged',
  body: 'Body ' + id, status: 'open', resolution_note: null, resolved_by: null, sent_at: null, resolved_at: null, created_at: Number(id.replace(/\D/g, '')) || 1, updated_at: 1, outdated: false, ...over });
const settle = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0)); await new Promise(resolve => requestAnimationFrame(() => resolve(null))); });
const item = (state: Record<string, unknown> = {}) => ({ id: 9, kind: 'gitUi.repository', args: { dir: '/w/proj', host: 'local' }, state });
const ctx = { agentId: 'ab', theme: 'dark' as const, readOnly: false };
const posts = (op: string) => request.mock.calls.filter(([url, o]) => url.includes('op=' + op) && o?.method === 'POST').map(([, o]) => o!.body as Record<string, unknown>);
const gutter = (line: number, side = 'new') => document.querySelector<HTMLButtonElement>(`button[data-gutter="${side}:${line}"]`)!;

/** Mirrors gitUi.commentsList: status filter, created_at order, LIMIT/OFFSET pages with nextPage and global counts. */
function commentsPage(url: string) {
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
  const status = q.get('status') ?? 'open', page = Number(q.get('page') ?? 0), limit = Number(q.get('limit') ?? 100);
  if (page < 0 || limit < 1 || limit > 500) throw new Error('Invalid pagination');
  const rows = comments.filter(c => status === 'all' || c.status === status).sort((a, b) => (a.created_at as number) - (b.created_at as number)).slice(page * limit, page * limit + limit + 1);
  return { comments: rows.slice(0, limit), nextPage: rows.length > limit ? page + 1 : null, openCount: comments.filter(c => c.status === 'open').length, unsentCount: comments.filter(c => c.status === 'open' && !c.sent_at).length };
}
beforeEach(() => {
  comments = []; files = [{ path: 'src/a.ts', group: 'unstaged', status: 'M' }]; sendResult = async () => ({ sent: 1 }); snapshotImpl = null;
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined });
  request.mockReset();
  request.mockImplementation(async (url: string, opts?: { method?: string; body?: unknown }) => {
    const body = (opts?.body ?? {}) as Record<string, unknown>;
    if (url.includes('op=snapshot') && snapshotImpl) return snapshotImpl(url);
    if (url.includes('op=snapshot')) return { root: '/w/proj', branch: 'main', head: 'abcdef1234', shallow: false, files, commits: [{ hash: 'c1c1c1c1c1', parents: [], author: 'A', date: new Date().toISOString(), subject: 'First' }], hasMore: false, page: 0, liveKey: 'K', liveState: 'watching' };
    if (url.includes('op=diff')) return { patch: PATCH, state: 'text', message: '' };
    if (url.includes('op=commit&')) return { hash: 'c1c1c1c1c1', comparison: 'root', files: [] };
    if (url.includes('op=comments&')) return commentsPage(url);
    if (url.includes('op=commentCreate')) { const a = body.anchor as Record<string, unknown>; const c = comment('n' + (comments.length + 10), { ...a, body: body.body as string }); comments = [...comments, c]; return { comment: c }; }
    if (url.includes('op=commentResolve')) { comments = comments.map(c => c.id === body.id ? { ...c, status: 'resolved', resolved_by: 'user' } : c); return { comment: null }; }
    if (url.includes('op=commentsSend')) { const r = await sendResult(); comments = comments.map(c => ({ ...c, sent_at: 5 })); return r; }
    return {};
  });
});

async function openFile(state: Record<string, unknown> = { path: 'src/a.ts', group: 'unstaged' }) {
  const view = render(<Repository context={ctx} item={item(state)} />); await settle();
  return view;
}

describe('git plugin UI', () => {
  it('declares the granted launcher and canvas kind', () => {
    const registry = createExtensionRegistry([git], { git: { canvasKinds: ['gitUi.repository'], canvasLaunchers: ['git'] } }, { git: 'ph-git-branch' });
    expect(registry.canvasLaunchers.map(l => l.key)).toEqual(['git/git']);
  });

  it('captures exact range text within one hunk', () => {
    const { rows } = parsePatch(PATCH);
    expect(rangeText(rows, { side: 'new', start: 4, end: 6 })).toBe('const d = 4;\nconst e = 5;\nconst f = 6;');
    expect(rangeText(rows, { side: 'old', start: 3, end: 3 })).toBe('const c = 3;');
    expect(extendRange(rows, 'new', 6, 4)).toEqual({ side: 'new', start: 4, end: 6 });
  });

  it('creates a comment from the composer with the exact anchor and returns focus on Escape', async () => {
    await openFile();
    fireEvent.click(gutter(4));
    const box = screen.getByRole('textbox', { name: 'Comment on line 4' });
    expect(document.activeElement).toBe(box);
    fireEvent.keyDown(box, { key: 'Escape' });
    await settle();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(gutter(4));
    fireEvent.click(gutter(4));
    const again = screen.getByRole('textbox', { name: 'Comment on line 4' });
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
    fireEvent.change(again, { target: { value: 'Rename d' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await settle();
    expect(posts('commentCreate')).toEqual([{ body: 'Rename d', anchor: { path: 'src/a.ts', old_path: null, side: 'new', line_start: 4, line_end: 4, line_text: 'const d = 4;', scope: 'worktree', commit_hash: null, worktree_group: 'unstaged' } }]);
    expect(screen.getByRole('article', { name: 'Comment on src/a.ts, line 4' })).toHaveTextContent('Rename d');
    expect(screen.getByRole('button', { name: /Send to agent \(1\)/ })).toBeEnabled();
  });

  it('selects ranges by shift-click and by drag; the card appears under the last line', async () => {
    await openFile();
    fireEvent.click(gutter(4));
    fireEvent.click(gutter(6), { shiftKey: true });
    expect(screen.getByRole('textbox', { name: 'Comment on lines 4–6' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    fireEvent.mouseDown(gutter(4), { button: 0 });
    fireEvent.mouseEnter(gutter(5)); fireEvent.mouseEnter(gutter(6));
    fireEvent.mouseUp(document); fireEvent.click(gutter(6));
    const box = screen.getByRole('textbox', { name: 'Comment on lines 4–6' });
    fireEvent.change(box, { target: { value: 'Range' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await settle();
    expect(posts('commentCreate')[0].anchor).toMatchObject({ line_start: 4, line_end: 6, line_text: 'const d = 4;\nconst e = 5;\nconst f = 6;' });
    const card = screen.getByRole('article', { name: 'Comment on src/a.ts, lines 4–6' });
    const row = gutter(6).closest('tr')!;
    expect(row.nextElementSibling).toContainElement(card);
  });

  it('filters comments by Open, Resolved and All with counts', async () => {
    comments = [comment('c1'), comment('c2', { status: 'resolved', resolved_by: 'agent', resolution_note: 'Done' }), comment('c3', { outdated: true })];
    await openFile({ section: 'comments' });
    expect(screen.getByRole('tab', { name: 'Open 2' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('⚠ Outdated')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Resolved 1' }));
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('Agent: Done')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'All 3' }));
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(request.mock.calls.filter(([u]) => u === '/canvas/ab/item/9').at(-1)?.[1]?.body).toEqual({ state: { filter: 'all' } });
  });

  it('sends once with spinner and shows success, disables at zero, reports errors', async () => {
    comments = [comment('c1')];
    let release!: () => void;
    sendResult = () => new Promise(r => { release = () => r({ sent: 1 }); });
    await openFile({});
    const button = screen.getByRole('button', { name: 'Send to agent (1)' });
    fireEvent.click(button); fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Sending…' })).toHaveAttribute('aria-busy', 'true');
    release(); await settle();
    expect(posts('commentsSend')).toHaveLength(1);
    expect(screen.getByText('Sent 1 comment to the agent', { selector: '.git-send-status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to agent (0)' })).toBeDisabled();
    comments = [comment('c4')]; sendResult = async () => { throw new Error('Agent is busy'); };
    await act(async () => live.onEvent!({ type: 'gitUi.comments.changed', key: 'K' })); await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Send to agent (1)' })); await settle();
    expect(screen.getByText('Not sent: Agent is busy', { selector: '.git-send-status' })).toBeInTheDocument();
  });

  it('live refresh keeps the selection, ignores foreign keys and shows vanished files', async () => {
    await openFile();
    fireEvent.click(gutter(4)); fireEvent.click(gutter(5), { shiftKey: true });
    const before = request.mock.calls.length;
    await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'OTHER' })); await settle();
    expect(request.mock.calls.length).toBe(before);
    await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle();
    expect(request.mock.calls.slice(before).some(([u]) => u.includes('op=diff'))).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Comment on lines 4–5' })).toBeInTheDocument();
    files = [];
    await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle();
    expect(screen.getByText('src/a.ts no longer has unstaged changes.')).toBeInTheDocument();
    await act(async () => live.onError!(new Error('down')));
    expect(screen.getByText('Not live')).toBeInTheDocument();
  });

  it('supports a keyboard-only review flow', async () => {
    await openFile({});
    const tab = screen.getByRole('tab', { name: 'Changes' });
    fireEvent.keyDown(tab, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'History' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    const option = screen.getByRole('option', { name: /a\.ts/ });
    option.focus(); fireEvent.keyDown(option, { key: 'Enter' }); await settle();
    const g = gutter(3); g.focus();
    fireEvent.keyDown(g, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(gutter(4), { key: 'Enter' });
    const box = screen.getByRole('textbox', { name: 'Comment on lines 3–4' });
    fireEvent.change(box, { target: { value: 'Keyboard' } });
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true }); await settle();
    const card = screen.getByRole('article', { name: 'Comment on src/a.ts, lines 3–4' });
    fireEvent.click(within(card).getByRole('button', { name: 'Resolve' })); await settle();
    expect(posts('commentResolve')).toEqual([{ id: comments[0].id }]);
    expect(live.types).toEqual(['gitUi.changed', 'gitUi.comments.changed']);
    expect(within(screen.getByRole('article')).getByText('✓ Resolved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to agent (0)' })).toBeDisabled();
  });
  describe('pagination and refresh', () => {
    /** History mock: `size` commits per page under the given HEAD, `total` commits overall. */
    const history = (state: { head: string; total: number; size?: number }) => (url: string) => {
      const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
      const page = Number(q.get('page') ?? 0), anchor = q.get('anchor') ?? state.head, size = state.size ?? 50;
      if (page > 200) throw new Error('Invalid history page');
      if (anchor !== state.head) throw new Error('History changed; refresh');
      const commits = Array.from({ length: Math.max(0, Math.min(size, state.total - page * size)) }, (_, i) => ({ hash: anchor.slice(0, 2) + 'h' + (page * size + i), parents: [], author: 'A', date: new Date().toISOString(), subject: anchor + ' #' + (page * size + i) }));
      return { root: '/w/proj', branch: 'main', head: state.head, shallow: false, files, commits, hasMore: state.total > (page + 1) * size, page, liveKey: 'K', liveState: 'watching' };
    };
    const snapshotCalls = (from = 0) => request.mock.calls.slice(from).map(([u]) => u).filter(u => u.includes('op=snapshot')).map(u => { const q = new URLSearchParams(u.slice(u.indexOf('?') + 1)); return q.get('page') + (q.get('anchor') ? '@' + q.get('anchor') : ''); });
    const historyRows = () => within(screen.getByRole('listbox', { name: 'Commit history' })).getAllByRole('option');
    const options = () => document.querySelectorAll('[role="option"]').length;
    const loadMore = async () => { fireEvent.click(screen.getByRole('button', { name: 'Load more' })); await settle(); };

    it('follows comments nextPage, keeps every open comment and reports exact partial resolved counts', async () => {
      comments = Array.from({ length: 1200 }, (_, i) => comment('r' + (i + 1), { status: 'resolved', resolved_by: 'user' }));
      comments.push(comment('o5000'), comment('o5001'), comment('o5002', { body: 'Newest open' }));
      await openFile({ section: 'comments' });
      expect(screen.getByRole('tab', { name: 'Open 3' })).toBeInTheDocument();
      expect(options()).toBe(3);
      expect(screen.getByText('Newest open')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Resolved 1200' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'All 1203' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('tab', { name: 'Resolved 1200' }));
      expect(options()).toBe(700);
      expect(screen.getByText('Showing the newest 700 of 1200 resolved comments; 500 older are not loaded.')).toBeInTheDocument();
      expect(screen.getByText('Body r1200')).toBeInTheDocument();
      expect(screen.queryByText('Body r1')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Load older resolved comments' })); await settle();
      expect(options()).toBe(1200);
      expect(screen.getByText('Body r1')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Load older resolved comments' })).toBeNull();
      // A refresh keeps the depth the person asked for.
      await act(async () => live.onEvent!({ type: 'gitUi.comments.changed', key: 'K' })); await settle();
      expect(options()).toBe(1200);
    }, 20000);

    it('never hides new open comments behind a large resolved history (>20k) and requests only bounded pages', async () => {
      comments = Array.from({ length: 20600 }, (_, i) => comment('r' + (i + 1), { status: 'resolved', resolved_by: 'user', body: 'R' }));
      await openFile({ section: 'comments' });
      const before = request.mock.calls.length;
      comments = [...comments, comment('o90000', { body: 'Fresh open' })];
      await act(async () => live.onEvent!({ type: 'gitUi.comments.changed', key: 'K' })); await settle();
      expect(screen.getByText('Fresh open')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Resolved 20600' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'All 20601' })).toBeInTheDocument();
      const bulk = request.mock.calls.slice(before).filter(([u]) => u.includes('status=resolved&limit=500'));
      expect(bulk.length).toBeLessThanOrEqual(2);
      fireEvent.click(screen.getByRole('tab', { name: /^All/ }));
      expect(screen.getByText(/Showing the newest \d+ of 20600 resolved comments/)).toBeInTheDocument();
    });

    it('a second comment refresh during the exit transition leaves no focusable ghost behind', async () => {
      comments = [comment('c1', { body: 'First' }), comment('c2', { body: 'Second' })];
      await openFile({ section: 'comments' });
      comments = comments.map(c => c.id === 'c1' ? { ...c, status: 'resolved' } : c);
      await act(async () => live.onEvent!({ type: 'gitUi.comments.changed', key: 'K' })); await settle();
      expect(screen.getAllByRole('option')).toHaveLength(1);
      const ghost = document.querySelector('.git-ghost')!;
      expect(ghost).toHaveAttribute('aria-hidden', 'true');
      expect(ghost).not.toHaveAttribute('tabindex');
      comments = [...comments, comment('c3', { body: 'Third' })];
      await act(async () => live.onEvent!({ type: 'gitUi.comments.changed', key: 'K' })); await settle();
      await act(async () => { await new Promise(r => setTimeout(r, 400)); });
      expect(document.querySelector('.git-ghost')).toBeNull();
      expect(document.querySelector('[data-leaving]')).toBeNull();
      expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([expect.stringContaining('Second'), expect.stringContaining('Third')]);
    });

    it('skips the exit transition under reduced motion and clears pending timers on unmount', async () => {
      Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
      comments = [comment('c1'), comment('c2')];
      const view = await openFile({ section: 'comments' });
      comments = comments.map(c => c.id === 'c1' ? { ...c, status: 'resolved' } : c);
      await act(async () => live.onEvent!({ type: 'gitUi.comments.changed', key: 'K' })); await settle();
      expect(document.querySelector('.git-ghost')).toBeNull();
      Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined });
      comments = comments.map(c => c.id === 'c2' ? { ...c, status: 'resolved' } : c);
      await act(async () => live.onEvent!({ type: 'gitUi.comments.changed', key: 'K' })); await settle();
      expect(document.querySelector('.git-ghost')).not.toBeNull();
      const clear = vi.spyOn(globalThis, 'clearTimeout');
      view.unmount();
      expect(clear).toHaveBeenCalled();
      clear.mockRestore();
    });

    it('shows comment load errors with Retry', async () => {
      const ok = request.getMockImplementation()!;
      request.mockImplementation(async (url, o) => { if (url.includes('op=comments&')) throw new Error('Comments unavailable'); return ok(url, o); });
      await openFile({ section: 'comments' });
      expect(screen.getByRole('alert')).toHaveTextContent('Comments unavailable');
      request.mockImplementation(ok);
      comments = [comment('c1')];
      fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' })); await settle();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getAllByRole('option')).toHaveLength(1);
    });

    it('discards a Load more page that finishes after HEAD changed, then pages from the new HEAD', async () => {
      const state = { head: 'aaaa', total: 120 };
      let gate: (() => void) | null = null;
      const base = history(state);
      const old = base('x?page=1&anchor=aaaa');
      // The old-HEAD page 1 response arrives only after HEAD moved and the view refreshed.
      snapshotImpl = async url => { if (url.includes('page=1&')) { await new Promise<void>(r => { gate = r; }); return old; } return base(url); };
      await openFile({ section: 'history' });
      expect(historyRows()).toHaveLength(50);
      fireEvent.click(screen.getByRole('button', { name: 'Load more' })); await settle();
      state.head = 'bbbb';
      snapshotImpl = base;
      await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle();
      const from = request.mock.calls.length;
      await act(async () => { gate!(); }); await settle();
      expect(historyRows()).toHaveLength(50);
      expect(historyRows()[0]).toHaveTextContent('bbbb #0');
      await loadMore();
      expect(snapshotCalls(from)).toEqual(['1@bbbb']);
      expect(historyRows()).toHaveLength(100);
      expect(historyRows()[99]).toHaveTextContent('bbbb #99');
    });

    it('does not refetch loaded history pages while HEAD is unchanged, and re-reads them when it moves', async () => {
      const state = { head: 'aaaa', total: 400 };
      snapshotImpl = history(state);
      await openFile({ section: 'history' });
      await loadMore(); await loadMore();
      expect(historyRows()).toHaveLength(150);
      let from = request.mock.calls.length;
      await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle();
      await act(async () => live.resync!('reconnect')); await settle();
      expect(snapshotCalls(from)).toEqual(['0', '0']);
      expect(historyRows()).toHaveLength(150);
      from = request.mock.calls.length;
      state.head = 'cccc';
      await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle();
      expect(snapshotCalls(from)).toEqual(['0', '1@cccc', '2@cccc']);
      expect(historyRows()).toHaveLength(150);
      expect(historyRows()[149]).toHaveTextContent('cccc #149');
    });

    it('stops at the backend history page limit with an explicit note instead of silently hiding Load more', async () => {
      snapshotImpl = history({ head: 'aaaa', total: 100000, size: 1 });
      await openFile({ section: 'history' });
      for (let i = 0; i < 200; i++) await act(async () => { fireEvent.click(screen.getByText('Load more')); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
      await settle();
      expect(historyRows()).toHaveLength(201);
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
      expect(screen.getByRole('note')).toHaveTextContent('Showing the latest 201 commits, the most this view can load.');
      expect(snapshotCalls().some(c => c.startsWith('201'))).toBe(false);
    }, 30000);
  });
});
