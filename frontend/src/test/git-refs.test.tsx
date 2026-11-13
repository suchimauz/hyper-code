import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const live = vi.hoisted(() => ({ onEvent: null as null | ((e: unknown) => void) }));
vi.mock('@mauzcode/ui', async () => ({
  ...await vi.importActual<typeof import('@mauzcode/ui')>('@mauzcode/ui'),
  requestJson: vi.fn(),
  useLiveSubscription: (o: { onEvent: (e: unknown) => void }) => { live.onEvent = o.onEvent; },
}));
// Same React/react-diff-view aliasing as git-extension.test.tsx: the plugin bundle maps react to the host copy.
vi.mock('../../../plugins/git/node_modules/react-diff-view/es/index.js', async () => await vi.importActual('../../../plugins/git/node_modules/react-diff-view/src/index.ts'));
vi.mock('../../../plugins/git/node_modules/react-diff-view/cjs/index.js', async () => await vi.importActual('../../../plugins/git/node_modules/react-diff-view/src/index.ts'));
vi.mock('../../../plugins/git/node_modules/react/index.js', async () => await vi.importActual('react'));
vi.mock('../../../plugins/git/node_modules/react/jsx-runtime.js', async () => await vi.importActual('react/jsx-runtime'));
vi.mock('../../../plugins/git/node_modules/react/jsx-dev-runtime.js', async () => await vi.importActual('react/jsx-dev-runtime'));
import { requestJson } from '@mauzcode/ui';
import { Repository } from '../../../plugins/git/ui';
import { refLabel, refText, type CommitRef } from '../../../plugins/git/ui/model';

const request = vi.mocked(requestJson);
const settle = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); await new Promise(r => requestAnimationFrame(() => r(null))); });
const item = (state: Record<string, unknown> = {}) => ({ id: 9, kind: 'gitUi.repository', args: { dir: '/w/proj', host: 'local' }, state });
const ctx = { agentId: 'ab', theme: 'dark' as const, readOnly: false };
const LONG = 'feature/' + 'very-long-segment-'.repeat(12) + '<script>alert(1)</script>&"q\'';
const head: CommitRef = { kind: 'head', name: 'HEAD', ref: 'HEAD', branch: 'main' };
const main: CommitRef = { kind: 'branch', name: 'main', ref: 'refs/heads/main', current: true };
const dupBranch: CommitRef = { kind: 'branch', name: 'dup', ref: 'refs/heads/dup' };
const dupTag: CommitRef = { kind: 'tag', name: 'dup', ref: 'refs/tags/dup', annotated: false };
const alias: CommitRef = { kind: 'remote', name: 'origin/HEAD', ref: 'refs/remotes/origin/HEAD', alias: 'origin/main' };
const v1: CommitRef = { kind: 'tag', name: 'v1', ref: 'refs/tags/v1', annotated: true };
const long: CommitRef = { kind: 'branch', name: LONG, ref: 'refs/heads/' + LONG };

type Snap = { head: string; total: number; refs: (hash: string) => CommitRef[]; refsKey: string; refsError?: string };
let snap: Snap;
const hashOf = (i: number) => (i.toString(16).padStart(4, '0')).repeat(10);
function snapshot(url: string) {
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
  const page = Number(q.get('page') ?? 0), anchor = q.get('anchor') ?? snap.head;
  if (anchor !== snap.head) throw new Error('History changed; refresh');
  const commits = Array.from({ length: Math.max(0, Math.min(50, snap.total - page * 50)) }, (_, i) => {
    const hash = hashOf(page * 50 + i);
    return { hash, parents: [], author: 'A', date: new Date().toISOString(), subject: 'Commit ' + (page * 50 + i), refs: snap.refs(hash) };
  });
  return { root: '/w/proj', branch: 'main', head: snap.head, shallow: false, files: [], commits, hasMore: snap.total > (page + 1) * 50, page, liveKey: 'K', liveState: 'watching', refsKey: snap.refsKey, ...(snap.refsError ? { refsError: snap.refsError } : {}) };
}
const calls = (op: string, from = 0) => request.mock.calls.slice(from).map(([u]) => u).filter(u => u.includes('op=' + op + '&') || u.endsWith('op=' + op));
const rows = () => within(screen.getByRole('listbox', { name: 'Commit history' })).getAllByRole('option');

beforeEach(() => {
  snap = { head: hashOf(0), total: 3, refsKey: 'k1', refs: h => h === hashOf(0) ? [head, main, alias, dupBranch, dupTag, v1] : h === hashOf(1) ? [long] : [] };
  request.mockReset();
  request.mockImplementation(async (url: string) => {
    if (url.includes('op=snapshot')) return snapshot(url);
    if (url.includes('op=refs')) { const byCommit: Record<string, CommitRef[]> = {}; for (let i = 0; i < snap.total; i++) { const r = snap.refs(hashOf(i)); if (r.length) byCommit[hashOf(i)] = r; } return { byCommit, key: snap.refsKey, truncated: false }; }
    if (url.includes('op=commit&')) return { hash: hashOf(0), comparison: 'root', files: [] };
    if (url.includes('op=comments&')) return { comments: [], nextPage: null, openCount: 0, unsentCount: 0 };
    return {};
  });
});

describe('Git history reference badges', () => {
  it('formats typed text like git log --decorate and labels kind in words', () => {
    expect([head, { ...head, branch: undefined, detached: true }, alias, v1, dupTag, main].map(refText)).toEqual(['HEAD -> main', 'HEAD', 'origin/HEAD -> origin/main', 'v1', 'dup', 'main']);
    expect(refLabel(head)).toBe('HEAD, current branch main');
    expect(refLabel({ kind: 'head', name: 'HEAD', ref: 'HEAD', detached: true })).toBe('HEAD, detached');
    expect(refLabel(main)).toBe('Current branch main');
    expect(refLabel(dupBranch)).toBe('Branch dup');
    expect(refLabel(dupTag)).toBe('Tag dup');
    expect(refLabel(v1)).toBe('Annotated tag v1');
    expect(refLabel(alias)).toBe('Remote branch origin/HEAD, alias of origin/main');
  });

  it('shows multiple typed badges per row, collapses overflow into a spoken +N and keeps colliding names distinct', async () => {
    render(<Repository context={ctx} item={item({ section: 'history' })} />); await settle();
    const first = rows()[0];
    const badges = first.querySelectorAll('.git-ref:not(.git-ref-more)');
    expect([...badges].map(b => b.getAttribute('data-kind'))).toEqual(['head', 'branch', 'remote']);
    expect(first).toHaveTextContent('HEAD, current branch main');
    expect(first).toHaveTextContent('Current branch main');
    expect(first.querySelector('.git-ref-more')).toHaveTextContent('3 more: Branch dup; Tag dup; Annotated tag v1');
    expect(first.querySelector('.git-ref-more [aria-hidden="true"]')).toHaveTextContent('+3');
    // Glyphs are decorative; kind is conveyed by text, not colour.
    for (const svg of first.querySelectorAll('.git-ref svg')) expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(rows()[2].querySelector('.git-refs')).toBeNull();
    // The selected commit lists every reference in full.
    fireEvent.click(first); await settle();
    const list = screen.getByRole('list', { name: 'References' });
    expect(within(list).getAllByRole('listitem').map(li => li.querySelector('.git-sr')!.textContent)).toEqual(['HEAD, current branch main', 'Current branch main', 'Remote branch origin/HEAD, alias of origin/main', 'Branch dup', 'Tag dup', 'Annotated tag v1']);
    expect(list.querySelector('[title="refs/heads/dup"]')).not.toBeNull();
    expect(list.querySelector('[title="refs/tags/dup"]')).not.toBeNull();
  });

  it('renders long and punctuated names as escaped text with the full ref discoverable, without breaking keyboard selection', async () => {
    render(<Repository context={ctx} item={item({ section: 'history' })} />); await settle();
    const second = rows()[1];
    const badge = second.querySelector('.git-ref')!;
    expect(badge.querySelector('.git-ref-text')!.textContent).toBe(LONG);
    expect(badge).toHaveAttribute('title', 'refs/heads/' + LONG);
    expect(document.querySelector('script')).toBeNull();
    expect(second.innerHTML).toContain('&lt;script&gt;');
    // Badges are not focus stops: roving focus over options is unchanged.
    expect(second.querySelectorAll('[tabindex]')).toHaveLength(0);
    rows()[0].focus();
    fireEvent.keyDown(rows()[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows()[1]);
    fireEvent.keyDown(rows()[1], { key: 'Enter' }); await settle();
    expect(rows()[1]).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('list', { name: 'References' })).getByText(LONG)).toBeInTheDocument();
  });

  it('reports a lookup failure distinctly while still listing commits', async () => {
    snap.refsError = 'ssh: connection reset'; snap.refs = () => [];
    render(<Repository context={ctx} item={item({ section: 'history' })} />); await settle();
    expect(rows()).toHaveLength(3);
    expect(document.querySelector('.git-refs-error')).toHaveTextContent('References unavailable: ssh: connection reset. Commits are still shown.');
    snap.refsError = undefined; snap.refsKey = 'k2';
    await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle();
    expect(screen.queryByText(/References unavailable/)).toBeNull();
  });

  it('ref-only refresh at an unchanged HEAD keeps loaded pages and re-decorates them with one refs read', async () => {
    snap.total = 120; snap.refs = () => [];
    render(<Repository context={ctx} item={item({ section: 'history' })} />); await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' })); await settle();
    expect(rows()).toHaveLength(100);
    let from = request.mock.calls.length;
    // Unchanged refs: no refs read and no older-page refetch.
    await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle();
    expect(calls('refs', from)).toHaveLength(0);
    expect(calls('snapshot', from).every(u => !u.includes('anchor='))).toBe(true);
    // A tag appears on a commit on the second page, and the branch moves within page one.
    from = request.mock.calls.length;
    snap.refsKey = 'k2'; snap.refs = h => h === hashOf(80) ? [v1] : h === hashOf(3) ? [main] : [];
    await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle();
    expect(calls('refs', from)).toHaveLength(1);
    expect(calls('snapshot', from).every(u => !u.includes('anchor='))).toBe(true);
    expect(rows()).toHaveLength(100);
    expect(rows()[80]).toHaveTextContent('Annotated tag v1');
    expect(rows()[3]).toHaveTextContent('Current branch main');
    // Ref lookup error during that read keeps commits and is reported.
    from = request.mock.calls.length;
    snap.refsKey = 'k3';
    request.mockImplementation(async (url: string) => {
      if (url.includes('op=refs')) throw new Error('Reference lookup failed');
      if (url.includes('op=snapshot')) return snapshot(url);
      if (url.includes('op=comments&')) return { comments: [], nextPage: null, openCount: 0, unsentCount: 0 };
      return {};
    });
    await act(async () => live.onEvent!({ type: 'gitUi.changed', key: 'K' })); await settle();
    expect(rows()).toHaveLength(100);
    expect(rows()[80].querySelector('.git-refs')).toBeNull();
    expect(document.querySelector('.git-refs-error')).toHaveTextContent('References unavailable: Reference lookup failed');
  });

  it('declares contrast and forced-colour rules, uses theme tokens and adds no motion (static stylesheet contract only)', () => {
    // jsdom cannot evaluate media queries or computed colours; this checks rule presence only, not rendering in a browser.
    const css = readFileSync(resolve(__dirname, '../../../plugins/git/ui/style.css'), 'utf8');
    const rules = css.slice(css.indexOf('.git-commit-title'), css.indexOf('@container git'));
    expect(rules).toMatch(/\.git-ref\[data-kind=remote\]\{border-style:dashed\}/);
    expect(rules).toMatch(/@media \(prefers-contrast:more\)/);
    expect(rules).toMatch(/@media \(forced-colors:active\)/);
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|transition|animation/i);
    expect(readFileSync(resolve(__dirname, '../../../plugins/git/ui/styles.ts'), 'utf8')).toContain(css.trim());
  });
});
