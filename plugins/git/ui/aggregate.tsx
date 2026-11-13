import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { CommentActions } from './comments';
import { DiffView } from './diff';
import { Icon, ICONS } from './header';
import { commentMatches, errorText, prefersReducedMotion, STATUS_LABEL, type Anchor, type GitFile, type Patch, type ReviewComment, type Target } from './model';

/** At most this many aggregate diff requests run at once; the rest wait in a queue that drops blocks scrolled away. */
export const MAX_CONCURRENT_DIFFS = 3;
/** Blocks within this distance of the visible scroll area count as near the viewport. */
const NEAR_MARGIN = '600px 0px';

/** One file block of an aggregate review: its precise comment target plus the file metadata from the list. */
export type AggregateEntry = { target: Target; file: GitFile };
export type AggregateSection = { id: string; label: string; entries: AggregateEntry[] };
/** Keyed collapse state shared by every aggregate of one repository tab: key → collapsed. */
export type CollapseMap = Record<string, boolean>;
type BlockState = { status: 'loading' | 'ok' | 'error'; version: number; patch?: Patch; error?: string };

/**
 * Stable identity of one aggregate file block: pinned repository host + directory, scope, worktree group or commit
 * hash, and path. Collapse state, load results and comment targets are keyed by it, so a path present in both Staged
 * and Unstaged, or in two commits, never shares state.
 */
export function blockKey(host: string, dir: string, target: Target): string {
  return JSON.stringify([host, dir, target.group === 'commit' ? 'commit' : 'worktree', target.group === 'commit' ? '' : target.group, target.hash ?? '', target.path]);
}

const STATE_LABEL: Record<string, string> = { binary: 'Binary file', conflict: 'Unresolved conflict', submodule: 'Submodule', large: 'Too large to display', empty: 'No textual changes' };

export type AggregateDiffProps = {
  host: string; dir: string;
  /** Identity of the aggregate as a whole (e.g. Changes, or one commit); a change discards stale requests. */
  aggregateKey: string;
  sections: AggregateSection[];
  /** Data version for live refresh: a change reloads near blocks (others reload when they come near) and keeps shown patches meanwhile. */
  version: number;
  load: (target: Target, signal: AbortSignal) => Promise<Patch>;
  collapsed: CollapseMap;
  onCollapse: (changes: CollapseMap) => void;
  split: boolean; comments: ReviewComment[]; actions: CommentActions; readOnly: boolean;
  onCreate: (anchor: Anchor, body: string) => Promise<void>;
  /** Navigate to a block: expands it, scrolls it into view and focuses its header. `n` makes repeats distinct. */
  jump?: { key: string; n: number } | null;
  /** Shown above the blocks (e.g. comparison description). */
  intro?: ReactNode;
  empty: ReactNode;
};

/**
 * Whole-review diff: every file as an independently collapsible block (expanded by default) reusing DiffView and the
 * comment actions. Expanded blocks load lazily near the viewport through a bounded queue; responses for an older
 * aggregate or version are discarded. Each block owns its loading, error and non-text state.
 */
export function AggregateDiff(p: AggregateDiffProps) {
  const uid = useId();
  const keyed = p.sections.map(s => ({ ...s, entries: s.entries.map(e => ({ ...e, key: blockKey(p.host, p.dir, e.target) })) }));
  const all = keyed.flatMap(s => s.entries);
  const isCollapsed = (key: string) => p.collapsed[key] === true;
  const [states, setStates] = useState<Record<string, BlockState>>({});
  const [near, setNear] = useState<Set<string>>(() => new Set());
  const [observing, setObserving] = useState(() => typeof IntersectionObserver !== 'undefined');
  const root = useRef<HTMLDivElement>(null);
  const queue = useRef({ gen: 0, active: new Map<string, { ctl: AbortController; version: number }>(), pending: [] as string[] });
  const latest = useRef(p); latest.current = p;

  // A new aggregate (another commit, section or repository) drops every result and in-flight request of the old one.
  useEffect(() => {
    const q = queue.current;
    q.gen++;
    setStates({}); setNear(new Set());
    // Cleanup (aggregate change or unmount) invalidates the generation too, so no late response can set state.
    return () => { q.gen++; for (const a of q.active.values()) a.ctl.abort(); q.active.clear(); q.pending = []; };
  }, [p.aggregateKey]);

  // Near-viewport tracking relative to the scroll container. Without IntersectionObserver every block counts as near;
  // the bounded queue still limits concurrency.
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setObserving(false); return; }
    const scroller = root.current?.closest('.git-diff-scroll') ?? null;
    const io = new IntersectionObserver(items => setNear(prev => {
      const next = new Set(prev);
      for (const it of items) { const k = (it.target as HTMLElement).dataset.blockKey!; if (it.isIntersecting) next.add(k); else next.delete(k); }
      return next;
    }), { root: scroller, rootMargin: NEAR_MARGIN });
    observer.current = io; setObserving(true);
    root.current?.querySelectorAll<HTMLElement>('[data-block-key]').forEach(el => io.observe(el));
    return () => { io.disconnect(); observer.current = null; };
  }, [p.aggregateKey, all.length > 0]);
  const observe = useCallback((el: HTMLElement | null) => { if (el) observer.current?.observe(el); }, []);
  const isNear = (key: string) => !observing || near.has(key);

  const start = (key: string) => {
    const q = queue.current, gen = q.gen, cur = latest.current;
    const entry = cur.sections.flatMap(s => s.entries).find(e => blockKey(cur.host, cur.dir, e.target) === key);
    if (!entry) return;
    const version = cur.version, ctl = new AbortController();
    q.active.set(key, { ctl, version });
    setStates(s => ({ ...s, [key]: { ...s[key], status: 'loading', version, error: undefined } }));
    // Accept a response only for the current aggregate generation AND the current data version; an older version's
    // response is dropped (the previously shown patch stays until the current request answers).
    const current = () => gen === q.gen && !ctl.signal.aborted && latest.current.version === version;
    cur.load(entry.target, ctl.signal)
      .then(patch => { if (current()) setStates(s => ({ ...s, [key]: { status: 'ok', version, patch } })); })
      .catch(e => { if (current()) setStates(s => ({ ...s, [key]: { status: 'error', version, error: errorText(e), patch: s[key]?.patch } })); })
      .finally(() => { if (q.active.get(key)?.ctl === ctl) q.active.delete(key); if (gen === q.gen) setPump(n => n + 1); });
  };
  const [pump, setPump] = useState(0);
  // Schedule: wanted = expanded, near and without a result for the current version. Queued blocks that are no longer
  // wanted leave the queue; in-flight requests for blocks that vanished are aborted.
  useEffect(() => {
    const q = queue.current;
    // A live refresh supersedes in-flight requests of an older version: abort them so the slot is reused at once.
    for (const [k, a] of q.active) if (a.version !== p.version) { a.ctl.abort(); q.active.delete(k); }
    const wanted = all.filter(e => !isCollapsed(e.key) && isNear(e.key) && !q.active.has(e.key) && (states[e.key]?.version !== p.version || !states[e.key])).map(e => e.key);
    const present = new Set(all.map(e => e.key));
    for (const [k, a] of q.active) if (!present.has(k)) { a.ctl.abort(); q.active.delete(k); }
    q.pending = wanted;
    while (q.active.size < MAX_CONCURRENT_DIFFS && q.pending.length) start(q.pending.shift()!);
  });
  void pump;

  // Jump: expand, scroll into view and focus the header of the requested block.
  const jumpKey = p.jump ? p.jump.key + '#' + p.jump.n : '';
  useEffect(() => {
    if (!p.jump) return;
    const key = p.jump.key;
    if (isCollapsed(key)) p.onCollapse({ [key]: false });
    requestAnimationFrame(() => {
      const el = [...(root.current?.querySelectorAll<HTMLElement>('[data-block-key]') ?? [])].find(x => x.dataset.blockKey === key);
      el?.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      el?.querySelector<HTMLButtonElement>('.git-block-toggle')?.focus({ preventScroll: true });
    });
  }, [jumpKey]);

  if (!all.length) return <>{p.empty}</>;
  const anyExpanded = all.some(e => !isCollapsed(e.key)), anyCollapsed = all.some(e => isCollapsed(e.key));
  const setAll = (value: boolean) => p.onCollapse(Object.fromEntries(all.map(e => [e.key, value])));
  const retry = (key: string) => setStates(s => { const { [key]: _, ...rest } = s; return rest; });
  let index = 0;
  return <div className="git-aggregate" ref={root}>
    <div className="git-aggregate-bar">
      <span className="git-hint">{all.length} {all.length === 1 ? 'file' : 'files'}</span>
      {p.intro}
      <span className="git-aggregate-actions">
        <button type="button" className="git-btn git-btn-quiet" onClick={() => setAll(true)} disabled={!anyExpanded}>Collapse all</button>
        <button type="button" className="git-btn git-btn-quiet" onClick={() => setAll(false)} disabled={!anyCollapsed}>Expand all</button>
      </span>
    </div>
    {keyed.map(section => <section key={section.id} className="git-aggregate-section" aria-label={section.label + ' files'}>
      {keyed.length > 1 || section.label ? <h4 className="git-aggregate-title">{section.label} <span className="git-group-count">{section.entries.length}</span></h4> : null}
      {section.entries.map(e => {
        const id = uid + '-b' + index++, collapsed = isCollapsed(e.key), st = states[e.key];
        const blockComments = p.comments.filter(c => commentMatches(c, e.target));
        const open = blockComments.filter(c => c.status === 'open').length;
        return <section key={e.key} className="git-block" data-block-key={e.key} ref={observe} aria-labelledby={id + '-h'}>
          <h5 className="git-block-head" id={id + '-h'}>
            <button type="button" className="git-block-toggle" aria-expanded={!collapsed} aria-controls={id + '-body'} onClick={() => p.onCollapse({ [e.key]: !collapsed })}>
              <span className="git-block-chevron" aria-hidden="true"><Icon d={ICONS.chevron} size={13} /></span>
              <span className="git-glyph" data-status={e.file.status[0]} title={STATUS_LABEL[e.file.status[0]!] ?? e.file.status}><span aria-hidden="true">{e.file.status[0]}</span><span className="git-sr">{STATUS_LABEL[e.file.status[0]!] ?? 'Status ' + e.file.status}</span></span>
              <span className="git-block-path">{e.file.oldPath ? <><span className="git-hint">{e.file.oldPath} → </span>{e.file.path}</> : e.file.path}</span>
              {e.file.special && <span className="git-chip">{STATE_LABEL[e.file.special] ?? e.file.special}</span>}
              {open > 0 && <span className="git-count" aria-label={open + (open === 1 ? ' open comment' : ' open comments')}><Icon d={ICONS.comment} size={11} />{open}</span>}
            </button>
          </h5>
          <div id={id + '-body'} className="git-block-body" hidden={collapsed}>
            {collapsed ? null : body(e, st, blockComments, () => retry(e.key), isNear(e.key))}
          </div>
        </section>;
      })}
    </section>)}
  </div>;

  function body(e: AggregateEntry & { key: string }, st: BlockState | undefined, blockComments: ReviewComment[], onRetry: () => void, nearNow: boolean) {
    if (st?.status === 'error') return <div className="git-alert" role="alert"><Icon d={ICONS.alert} /><span>{st.error}</span><button type="button" className="git-btn git-btn-quiet" onClick={onRetry}>Retry</button></div>;
    if (!st?.patch) return <div className="git-block-pending" role="status" aria-label={nearNow ? 'Loading diff for ' + e.target.path : 'Diff for ' + e.target.path + ' loads when scrolled into view'}>
      {nearNow && <><span /><span /><span /></>}</div>;
    const patch = st.patch;
    if (patch.state !== 'text') return <p className="git-block-state" role="note" data-state={patch.state}><strong>{STATE_LABEL[patch.state] ?? patch.state}</strong>{patch.message ? ' — ' + patch.message : ''}</p>;
    return <DiffView patch={patch.patch} target={e.target} oldPath={e.file.oldPath ?? null} split={p.split} comments={blockComments}
      actions={p.actions} readOnly={p.readOnly} focusComment={null} onCreate={p.onCreate} />;
  }
}
