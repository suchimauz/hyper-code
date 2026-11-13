import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const live = vi.hoisted(() => ({ onEvent: null as null | ((e: unknown) => void) }));
vi.mock('@mauzcode/ui', async () => ({
  ...await vi.importActual<typeof import('@mauzcode/ui')>('@mauzcode/ui'),
  requestJson: vi.fn(),
  useLiveSubscription: (o: { onEvent: (e: unknown) => void }) => { live.onEvent = o.onEvent; },
}));
// Same React/react-diff-view mapping as git-extension.test.tsx (the plugin's own React copy must not load).
vi.mock('../../../plugins/git/node_modules/react-diff-view/es/index.js', async () => await vi.importActual('../../../plugins/git/node_modules/react-diff-view/src/index.ts'));
vi.mock('../../../plugins/git/node_modules/react-diff-view/cjs/index.js', async () => await vi.importActual('../../../plugins/git/node_modules/react-diff-view/src/index.ts'));
vi.mock('../../../plugins/git/node_modules/react/index.js', async () => await vi.importActual('react'));
vi.mock('../../../plugins/git/node_modules/react/jsx-runtime.js', async () => await vi.importActual('react/jsx-runtime'));
vi.mock('../../../plugins/git/node_modules/react/jsx-dev-runtime.js', async () => await vi.importActual('react/jsx-dev-runtime'));
import { requestJson } from '@mauzcode/ui';
import { Repository } from '../../../plugins/git/ui';
import { blockKey, MAX_CONCURRENT_DIFFS } from '../../../plugins/git/ui/aggregate';

const request = vi.mocked(requestJson);
const patchFor = (path: string, oldPath = path) => [`diff --git a/${oldPath} b/${path}`, `--- a/${oldPath}`, `+++ b/${path}`, '@@ -1,3 +1,3 @@', ' one', '-two', '+TWO', ' three', ''].join('\n');
type F = { path: string; group?: string; status: string; oldPath?: string; special?: string };
type C = Record<string, unknown> & { id: string; status: string };
let files: F[] = [];
let commits: Record<string, { comparison: string; files: F[] } | Error> = {};
let comments: C[] = [];
/** Per-request diff behaviour; default is a small text patch for the requested path. */
let diffImpl: (q: URLSearchParams, signal?: AbortSignal) => Promise<unknown> | unknown = q => ({ patch: patchFor(q.get('path')!), state: 'text', message: '' });
const H1 = 'a'.repeat(40), H2 = 'b'.repeat(40);
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); await new Promise(r => requestAnimationFrame(() => r(null))); });
const item = (state: Record<string, unknown> = {}) => ({ id: 9, kind: 'gitUi.repository', args: { dir: '/w/proj', host: 'box' }, state });
const ctx = { agentId: 'ab', theme: 'dark' as const, readOnly: false };
const diffCalls = () => request.mock.calls.filter(([u]) => u.includes('op=diff')).map(([u]) => new URLSearchParams(u.slice(u.indexOf('?') + 1)));
const posts = (op: string) => request.mock.calls.filter(([u, o]) => u.includes('op=' + op) && o?.method === 'POST').map(([, o]) => o!.body as Record<string, unknown>);
const block = (name: string | RegExp, scope: HTMLElement = document.body) => within(scope).getByRole('button', { name }).closest('section.git-block') as HTMLElement;
const gutterIn = (el: HTMLElement, line: number, side = 'new') => el.querySelector<HTMLButtonElement>(`button[data-gutter="${side}:${line}"]`)!;
const comment = (id: string, over: Partial<C>): C => ({ id, path: 'a.ts', old_path: null, side: 'new', line_start: 2, line_end: 2, line_text: 'TWO', scope: 'worktree', commit_hash: null, worktree_group: 'unstaged',
  body: 'Body ' + id, status: 'open', resolution_note: null, resolved_by: null, sent_at: null, resolved_at: null, created_at: 1, updated_at: 1, outdated: false, ...over });

/** Controllable IntersectionObserver: `show(keys)` marks exactly those blocks as near the viewport. */
class FakeIO {
  static all: FakeIO[] = [];
  els = new Set<Element>();
  constructor(private cb: IntersectionObserverCallback, public options?: IntersectionObserverInit) { FakeIO.all.push(this); }
  observe(el: Element) { this.els.add(el); }
  unobserve(el: Element) { this.els.delete(el); }
  disconnect() { this.els.clear(); }
  static show(pred: (path: string) => boolean) {
    for (const io of FakeIO.all) io.cb([...io.els].map(el => ({ target: el, isIntersecting: pred(JSON.parse((el as HTMLElement).dataset.blockKey!)[5]) }) as unknown as IntersectionObserverEntry), io as unknown as IntersectionObserver);
  }
}

beforeEach(() => {
  files = []; commits = {}; comments = []; FakeIO.all = [];
  diffImpl = q => ({ patch: patchFor(q.get('path')!), state: 'text', message: '' });
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined });
  request.mockReset();
  request.mockImplementation(async (url: string, opts?: { method?: string; body?: unknown; signal?: AbortSignal }) => {
    const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    const body = (opts?.body ?? {}) as Record<string, unknown>;
    if (q.get('op') === 'snapshot') return { root: '/w/proj', branch: 'main', head: H1, shallow: false, files, hasMore: false, page: 0, liveKey: 'K', liveState: 'polling',
      commits: [{ hash: H1, parents: [H2], author: 'A', date: new Date().toISOString(), subject: 'Second' }, { hash: H2, parents: [], author: 'A', date: new Date().toISOString(), subject: 'First' }] };
    if (q.get('op') === 'diff') return diffImpl(q, opts?.signal);
    if (q.get('op') === 'commit') { const c = commits[q.get('hash')!]; if (c instanceof Error) throw c; return { hash: q.get('hash'), parent: '', ...c }; }
    if (q.get('op') === 'comments') return { comments: q.get('status') === 'open' ? comments.filter(c => c.status === 'open') : [], nextPage: null, openCount: comments.filter(c => c.status === 'open').length, unsentCount: 0 };
    if (q.get('op') === 'commentCreate') { const c = comment('n' + comments.length, { ...(body.anchor as object), body: body.body as string }); comments = [...comments, c]; return { comment: c }; }
    return {};
  });
});
afterEach(() => { delete (window as { IntersectionObserver?: unknown }).IntersectionObserver; });

describe('aggregate block identity', () => {
  it('keys blocks by repository host and directory, scope, group, commit hash and path', () => {
    const keys = [
      blockKey('box', '/w', { path: 'a', group: 'staged' }), blockKey('box', '/w', { path: 'a', group: 'unstaged' }),
      blockKey('local', '/w', { path: 'a', group: 'staged' }), blockKey('box', '/v', { path: 'a', group: 'staged' }),
      blockKey('box', '/w', { path: 'a', group: 'commit', hash: H1 }), blockKey('box', '/w', { path: 'a', group: 'commit', hash: H2 }),
      blockKey('box', '/w', { path: 'b', group: 'staged' }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(blockKey('box', '/w', { path: 'a', group: 'staged' })).toBe(blockKey('box', '/w', { path: 'a', group: 'staged' }));
  });
});

describe('Changes Full diff', () => {
  it('shows Staged, Unstaged and Untracked as separate sections with independent targets, keeping single-file view', async () => {
    files = [{ path: 'a.ts', group: 'staged', status: 'M' }, { path: 'a.ts', group: 'unstaged', status: 'M' }, { path: 'new.ts', group: 'untracked', status: '?' }];
    comments = [comment('c1', { worktree_group: 'staged', body: 'Staged note' })];
    render(<Repository context={ctx} item={item()} />); await settle();
    fireEvent.click(screen.getByRole('button', { name: /Full diff/ })); await settle();
    const staged = screen.getByRole('region', { name: 'Staged files' }), unstaged = screen.getByRole('region', { name: 'Unstaged files' });
    expect(screen.getByRole('region', { name: 'Untracked files' })).toBeInTheDocument();
    const sb = block(/a\.ts/, staged), ub = block(/a\.ts/, unstaged);
    expect(within(sb).getByText('Staged note')).toBeInTheDocument();
    expect(within(ub).queryByText('Staged note')).toBeNull();
    expect(diffCalls().map(q => q.get('group') + ':' + q.get('path')).sort()).toEqual(['staged:a.ts', 'unstaged:a.ts', 'untracked:new.ts']);
    fireEvent.click(gutterIn(ub, 2));
    const box = within(ub).getByRole('textbox', { name: 'Comment on line 2' });
    fireEvent.change(box, { target: { value: 'Unstaged only' } });
    fireEvent.click(within(ub).getByRole('button', { name: 'Comment' })); await settle();
    expect(posts('commentCreate')[0].anchor).toMatchObject({ path: 'a.ts', scope: 'worktree', worktree_group: 'unstaged', commit_hash: null, side: 'new', line_start: 2 });
    expect(within(block(/a\.ts/, screen.getByRole('region', { name: 'Unstaged files' }))).getByText('Unstaged only')).toBeInTheDocument();
    expect(within(block(/a\.ts/, screen.getByRole('region', { name: 'Staged files' }))).queryByText('Unstaged only')).toBeNull();
    // Picking a file returns to the single-file view of exactly that target.
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Changed files' })).getAllByRole('option', { name: /a\.ts/ })[0]); await settle();
    expect(screen.queryByRole('region', { name: 'Staged files' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'a.ts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Full diff/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles blocks from the keyboard with expanded semantics and collapse/expand all, kept across live refresh', async () => {
    files = [{ path: 'a.ts', group: 'unstaged', status: 'M' }, { path: 'b.ts', group: 'unstaged', status: 'M' }];
    render(<Repository context={ctx} item={item({ full: true })} />); await settle();
    const toggle = screen.getByRole('button', { name: /a\.ts/, expanded: true });
    expect(toggle).toHaveAttribute('aria-controls');
    toggle.focus(); fireEvent.click(toggle); // Enter/Space on a native button dispatch click
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(toggle);
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).not.toBeVisible();
    expect(screen.getByRole('button', { name: /b\.ts/ })).toHaveAttribute('aria-expanded', 'true');
    const before = diffCalls().length;
    await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle();
    // Only the expanded block reloads; the collapsed one keeps its state and makes no request.
    expect(diffCalls().slice(before).map(q => q.get('path'))).toEqual(['b.ts']);
    expect(screen.getByRole('button', { name: /a\.ts/ })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' })); await settle();
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(2);
  });
});

describe('History aggregate', () => {
  it('opens the whole commit, navigates to file blocks and isolates collapse state per commit', async () => {
    commits[H1] = { comparison: 'First parent (merge)', files: [{ path: 'a.ts', status: 'M' }, { path: 'b.ts', status: 'R100', oldPath: 'old/b.ts' }] };
    commits[H2] = { comparison: 'Empty tree (initial commit)', files: [{ path: 'a.ts', status: 'A' }] };
    const scroll = vi.fn(); Element.prototype.scrollIntoView = scroll;
    render(<Repository context={ctx} item={item({ section: 'history' })} />); await settle();
    fireEvent.click(screen.getByRole('option', { name: /Second/ })); await settle();
    expect(screen.getByText('Compared with: First parent (merge)')).toBeInTheDocument();
    expect(diffCalls().map(q => q.get('path') + '@' + q.get('hash')).sort()).toEqual(['a.ts@' + H1, 'b.ts@' + H1]);
    // Rename anchor: commenting on the renamed file keeps old_path.
    const renamed = block(/b\.ts/);
    expect(renamed).toHaveTextContent('old/b.ts →');
    fireEvent.click(gutterIn(renamed, 2, 'old'));
    fireEvent.change(within(renamed).getByRole('textbox'), { target: { value: 'Old side' } });
    fireEvent.click(within(renamed).getByRole('button', { name: 'Comment' })); await settle();
    expect(posts('commentCreate')[0].anchor).toMatchObject({ path: 'b.ts', old_path: 'old/b.ts', side: 'old', line_start: 2, scope: 'commit', commit_hash: H1, worktree_group: null });
    // File navigation jumps to (and expands) its block.
    fireEvent.click(screen.getByRole('button', { name: /a\.ts/ }));
    expect(screen.getByRole('button', { name: /a\.ts/ })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(within(screen.getByRole('listbox', { name: /Files changed in/ })).getByRole('option', { name: /a\.ts/ })); await settle();
    const toggle = screen.getByRole('button', { name: /a\.ts/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(toggle);
    expect(scroll).toHaveBeenCalled();
    fireEvent.click(toggle);
    // Another commit with the same path keeps its own (expanded) state; returning restores the collapsed one.
    fireEvent.click(screen.getByRole('option', { name: /First/ })); await settle();
    expect(screen.getByText('Compared with: Empty tree (initial commit)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /a\.ts/ })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('option', { name: /Second/ })); await settle();
    expect(screen.getByRole('button', { name: /a\.ts/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('reports an unavailable shallow parent instead of an empty diff', async () => {
    commits[H1] = new Error('Parent unavailable in shallow history');
    render(<Repository context={ctx} item={item({ section: 'history', hash: H1 })} />); await settle();
    expect(screen.getAllByRole('alert').some(a => a.textContent?.includes('Comparison unavailable: Parent unavailable in shallow history'))).toBe(true);
    expect(screen.queryByText('This commit changes no files')).toBeNull();
    expect(diffCalls()).toHaveLength(0);
  });

  it('discards responses for a previously selected commit', async () => {
    commits[H1] = { comparison: 'First parent', files: [{ path: 'slow.ts', status: 'M' }] };
    commits[H2] = { comparison: 'Empty tree (initial commit)', files: [{ path: 'fast.ts', status: 'A' }] };
    let release!: () => void; const aborted: boolean[] = [];
    diffImpl = (q, signal) => q.get('path') === 'slow.ts'
      ? new Promise(r => { release = () => { aborted.push(!!signal?.aborted); r({ patch: patchFor('slow.ts'), state: 'text', message: '' }); }; })
      : { patch: patchFor('fast.ts'), state: 'text', message: '' };
    render(<Repository context={ctx} item={item({ section: 'history', hash: H1 })} />); await settle();
    fireEvent.click(screen.getByRole('option', { name: /First/ })); await settle();
    await act(async () => release()); await settle();
    expect(aborted).toEqual([true]);
    expect(screen.queryByText(/slow\.ts/, { selector: '.git-block-path' })).toBeNull();
    expect(screen.getByRole('button', { name: /fast\.ts/ })).toBeInTheDocument();
    expect(document.querySelectorAll('.git-block table').length).toBe(1);
  });
});

describe('stale responses', () => {
  const v = (n: number) => ({ patch: patchFor('a.ts').replace('+TWO', '+V' + n), state: 'text', message: '' });
  it('drops an in-flight response of an older live-refresh version, keeps the shown patch and loads the current one', async () => {
    files = [{ path: 'a.ts', group: 'unstaged', status: 'M' }];
    const pending: { resolve: () => void; signal?: AbortSignal; n: number }[] = []; let n = 0, inflight = 0, peak = 0;
    diffImpl = (_q, signal) => { const me = ++n; inflight++; peak = Math.max(peak, inflight); return new Promise(r => pending.push({ n: me, signal, resolve: () => { inflight--; r(v(me)); } })); };
    render(<Repository context={ctx} item={item({ full: true })} />); await settle();
    await act(async () => pending.shift()!.resolve()); await settle();
    expect(screen.getByText('V1')).toBeInTheDocument();
    await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle(); // version 2 in flight
    const second = pending.shift()!;
    await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle(); // version 3 supersedes it
    expect(second.signal?.aborted).toBe(true);
    await act(async () => second.resolve()); await settle(); // the old response arrives late
    expect(screen.queryByText('V2')).toBeNull();
    expect(screen.getByText('V1')).toBeInTheDocument(); // previously shown patch kept meanwhile
    expect(pending).toHaveLength(1);
    await act(async () => pending.shift()!.resolve()); await settle();
    expect(screen.getByText('V3')).toBeInTheDocument();
    expect(diffCalls()).toHaveLength(3);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_DIFFS);
  });

  it('aborts and ignores in-flight requests after unmount', async () => {
    files = [{ path: 'a.ts', group: 'unstaged', status: 'M' }];
    let pend: { resolve: () => void; signal?: AbortSignal } | null = null;
    diffImpl = (_q, signal) => new Promise(r => { pend = { signal, resolve: () => r(v(1)) }; });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = render(<Repository context={ctx} item={item({ full: true })} />); await settle();
    view.unmount();
    expect(pend!.signal?.aborted).toBe(true);
    await act(async () => pend!.resolve()); await settle();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('bounded loading and block states', () => {
  it('loads only near-viewport expanded blocks with bounded concurrency', async () => {
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
    files = Array.from({ length: 12 }, (_, i) => ({ path: 'f' + i + '.ts', group: 'unstaged', status: 'M' }));
    const pending: (() => void)[] = []; let inflight = 0, peak = 0;
    diffImpl = q => { inflight++; peak = Math.max(peak, inflight); return new Promise(r => pending.push(() => { inflight--; r({ patch: patchFor(q.get('path')!), state: 'text', message: '' }); })); };
    render(<Repository context={ctx} item={item({ full: true })} />); await settle();
    expect(diffCalls()).toHaveLength(0); // nothing is near yet
    await act(async () => FakeIO.show(p => ['f0.ts', 'f1.ts', 'f2.ts', 'f3.ts', 'f4.ts'].includes(p))); await settle();
    expect(diffCalls()).toHaveLength(MAX_CONCURRENT_DIFFS);
    while (pending.length) { await act(async () => pending.shift()!()); await settle(); }
    expect(diffCalls().map(q => q.get('path'))).toEqual(['f0.ts', 'f1.ts', 'f2.ts', 'f3.ts', 'f4.ts']);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_DIFFS);
    expect(screen.getByRole('status', { name: 'Diff for f9.ts loads when scrolled into view' })).toBeInTheDocument();
    // A collapsed offscreen block stays unloaded even when scrolled near.
    fireEvent.click(screen.getByRole('button', { name: /f9\.ts/ }));
    await act(async () => FakeIO.show(p => p === 'f9.ts' || p === 'f10.ts')); await settle();
    while (pending.length) { await act(async () => pending.shift()!()); await settle(); }
    expect(diffCalls().map(q => q.get('path')).slice(5)).toEqual(['f10.ts']);
  });

  it('shows explicit per-file states and errors without hiding other blocks; unified and split render', async () => {
    files = ['bin', 'conflict', 'sub', 'large', 'fail', 'ok'].map(p => ({ path: p, group: 'unstaged', status: 'M' }));
    comments = [comment('o1', { path: 'ok', outdated: true, line_start: 99, line_end: 99, line_text: 'gone', body: 'Outdated note' })];
    const states: Record<string, unknown> = { bin: { patch: '', state: 'binary', message: 'Binary file — text diff unavailable.' }, conflict: { patch: '', state: 'conflict', message: 'Unresolved conflict — resolve outside this read-only viewer.' },
      sub: { patch: '', state: 'submodule', message: 'Submodule change — nested repository content is not expanded.' }, large: { patch: '', state: 'large', message: 'Diff exceeds 256 KiB.' } };
    let failures = 1;
    diffImpl = q => { const p = q.get('path')!; if (p === 'fail' && failures-- > 0) throw new Error('ssh: connection refused'); return states[p] ?? { patch: patchFor(p), state: 'text', message: '' }; };
    render(<Repository context={ctx} item={item({ full: true })} />); await settle();
    expect(block('Modified bin')).toHaveTextContent('Binary file — Binary file — text diff unavailable.');
    expect(block('Modified conflict')).toHaveTextContent('Unresolved conflict');
    expect(block('Modified sub')).toHaveTextContent('Submodule');
    expect(block('Modified large')).toHaveTextContent('Too large to display — Diff exceeds 256 KiB.');
    expect(within(block('Modified fail')).getByRole('alert')).toHaveTextContent('ssh: connection refused');
    const ok = block(/^Modified ok/);
    expect(within(ok).getByText('Outdated note')).toBeInTheDocument();
    expect(within(ok).getByText('⚠ Outdated')).toBeInTheDocument();
    expect(ok.querySelector('table.diff-unified')).not.toBeNull();
    fireEvent.click(within(block('Modified fail')).getByRole('button', { name: 'Retry' })); await settle();
    expect(block('Modified fail').querySelector('table')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Unified' })); await settle();
    expect(block(/^Modified ok/).querySelector('table.diff-split')).not.toBeNull();
  });
});
