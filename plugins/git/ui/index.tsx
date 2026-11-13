import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ApiError, requestJson, useLiveSubscription, type ExtensionCanvasProps, type ExtensionLauncherProps, type UiExtension } from '@mauzcode/ui';
import { CommentChips, type CommentActions } from './comments';
import { DiffView } from './diff';
import { Header, Icon, ICONS } from './header';
import { ListBox } from './list';
import { byFile, commentMatches, errorText, filterComments, GROUP_LABEL, GROUPS, moveIndex, openCountFor, prefersReducedMotion, rangeLabel, relativeDate, shortHash, STATUS_LABEL, targetOf,
  type Anchor, type Commit, type CommitFiles, type CommentsPage, type Filter, type GitFile, type Group, type Patch, type ReviewComment, type Section, type Snapshot, type Target } from './model';
import { styles } from './styles';
import { indicatorOf, useTransportStatus } from './useLive';

export { parsePatch, extendRange, rangeText, buildAnchor, moveIndex } from './model';
const KEEP_ALIVE_MS = 4 * 60 * 1000;
/** Backend limits: comments pages hold at most 500 rows; history pages are 0..200 of 50 commits each. */
const COMMENT_PAGE = 500, OPEN_PAGES = 4, MAX_HISTORY_PAGE = 200;
/** Loaded resolved history: total count, the lowest loaded page and whether every page is present. */
type ResolvedView = { total: number; first: number; older: number };
class Stale extends Error {}
const FILTERS: { id: Filter; label: string }[] = [{ id: 'open', label: 'Open' }, { id: 'resolved', label: 'Resolved' }, { id: 'all', label: 'All' }];
const str = (v: unknown) => typeof v === 'string' && v ? v : null;
const targetKey = (t: Target | null) => t ? t.group + ':' + (t.hash ?? '') + ':' + t.path : '';
const fileName = (path: string) => path.split('/').pop() || path;
const fileDir = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

function Launcher({ context }: ExtensionLauncherProps) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);
  const open = () => {
    if (!context.agentId || busy) return;
    setError(''); setBusy(true);
    requestJson('/gitUi?agentId=' + encodeURIComponent(context.agentId), { method: 'POST', body: {} }).catch(e => setError(errorText(e))).finally(() => setBusy(false));
  };
  useEffect(() => { if (!sent.current) { sent.current = true; open(); } }, [context.agentId]);
  return <section className="git-view git-launcher" data-theme={context.theme}><style>{styles}</style>
    <div className="git-empty"><Icon d={ICONS.branch} size={28} />
      <p>{error ? '' : 'Git opens in a project-bound Canvas tab.'}</p>
      {error && <p className="git-inline-alert" role="alert">{error}</p>}
      <button type="button" className="git-btn git-btn-primary" onClick={open} disabled={busy || !context.agentId}>{busy && <span className="git-spinner" aria-hidden="true" />}Open Git</button>
    </div>
  </section>;
}

const StatusGlyph = ({ status }: { status: string }) => <span className="git-glyph" data-status={status} title={STATUS_LABEL[status] ?? status}>
  <span aria-hidden="true">{status}</span><span className="git-sr">{STATUS_LABEL[status] ?? 'Status ' + status}</span></span>;
const CountBadge = ({ n }: { n: number }) => n > 0 ? <span className="git-count" aria-label={n + (n === 1 ? ' open comment' : ' open comments')}><Icon d={ICONS.comment} size={11} />{n}</span> : null;
const Skeleton = ({ label, rows = 5 }: { label: string; rows?: number }) => <div className="git-skeleton" role="status" aria-label={label}>{Array.from({ length: rows }, (_, i) => <span key={i} />)}</div>;
const Empty = ({ text, detail, icon = ICONS.file }: { text: string; detail?: string; icon?: string }) => <div className="git-empty" role="status"><Icon d={icon} size={26} /><p>{text}</p>{detail && <p className="git-hint">{detail}</p>}</div>;
const Alert = ({ text, onRetry }: { text: string; onRetry?: () => void }) => <div className="git-alert" role="alert"><Icon d={ICONS.alert} /><span>{text}</span>{onRetry && <button type="button" className="git-btn git-btn-quiet" onClick={onRetry}>Retry</button>}</div>;

/** The Git repository Canvas tab: live changes/history, inline review comments and explicit Send. */
export function Repository({ context, item }: ExtensionCanvasProps) {
  const agentId = context.agentId ?? '';
  const readOnly = context.readOnly;
  const dir = String(item.args.dir ?? ''), host = String(item.args.host ?? 'local');
  const base = '/gitUi?agentId=' + encodeURIComponent(agentId) + '&itemId=' + item.id;
  const initial = item.state;
  const [section, setSection] = useState<Section>(initial.section === 'history' || initial.section === 'comments' ? initial.section : 'changes');
  const [selection, setSelection] = useState<Target | null>(() => {
    const path = str(initial.path), group = str(initial.group);
    if (!path || !group) return null;
    if (group === 'commit') return str(initial.hash) ? { path, group: 'commit', hash: String(initial.hash) } : null;
    return (GROUPS as string[]).includes(group) ? { path, group: group as Group } : null;
  });
  const [hash, setHash] = useState<string | null>(str(initial.hash));
  const [split, setSplit] = useState(initial.split === true);
  const [filter, setFilter] = useState<Filter>(initial.filter === 'resolved' || initial.filter === 'all' ? initial.filter : 'open');
  const [focusId, setFocusId] = useState<string | null>(str(initial.comment));
  const [open, setOpen] = useState(false);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [watcher, setWatcher] = useState<{ state?: string; error?: string }>({});
  const [commit, setCommit] = useState<CommitFiles | null>(null);
  const [commitError, setCommitError] = useState('');
  const [patch, setPatch] = useState<{ key: string; data: Patch } | null>(null);
  const [diffError, setDiffError] = useState('');
  const [tick, setTick] = useState(0);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [counts, setCounts] = useState({ open: 0, unsent: 0 });
  const [resolvedView, setResolvedView] = useState<ResolvedView>({ total: 0, first: 0, older: 0 });
  const [openPartial, setOpenPartial] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [announce, setAnnounce] = useState('');
  const [subscriptionError, setSubscriptionError] = useState(false);
  const [transport, setTransport] = useTransportStatus();

  const snapGen = useRef(0), commentGen = useRef(0), sendingRef = useRef(false), pagesRef = useRef(1), liveKey = useRef<string | undefined>(undefined);
  const manual = useRef(false), lastAnnounce = useRef(0), snapRef = useRef<Snapshot | null>(null);
  /** Resolved history depth the person asked for (pages before the newest one) and the last known total. */
  const resolvedRef = useRef({ depth: 1, total: 0 });
  pagesRef.current = pages; snapRef.current = snapshot;
  const setPagesNow = (n: number) => { pagesRef.current = n; setPages(n); };
  const say = (text: string) => setAnnounce(a => a === text ? text + '\u200b' : text);

  const save = useCallback((state: Record<string, unknown>) => {
    if (!agentId || readOnly) return;
    requestJson('/canvas/' + encodeURIComponent(agentId) + '/item/' + item.id, { method: 'POST', body: { state } }).catch(() => {});
  }, [agentId, item.id, readOnly]);

  /** Re-read page 0; already-loaded history pages are kept while HEAD is unchanged and re-read only when it moved. */
  const loadSnapshot = useCallback(async (silent: boolean) => {
    const gen = ++snapGen.current;
    if (!silent) setLoading(true);
    try {
      const first = await requestJson<Snapshot>(base + '&op=snapshot&page=0');
      if (gen !== snapGen.current) return;
      const prev = snapRef.current;
      if (prev && first.head && prev.head === first.head && pagesRef.current > 1) {
        // History anchored at an unchanged HEAD is immutable: refresh files and keep the loaded commits.
        liveKey.current = first.liveKey;
        const merged = { ...first, commits: first.commits.concat(prev.commits.slice(first.commits.length)), hasMore: prev.hasMore };
        snapRef.current = merged; setSnapshot(merged); setError('');
        setWatcher({ state: first.liveState, error: first.liveError });
        return;
      }
      let commits = first.commits, hasMore = first.hasMore, loaded = 1;
      for (let p = 1; p < pagesRef.current && p <= MAX_HISTORY_PAGE && hasMore && first.head; p++) {
        const next = await requestJson<Snapshot>(base + '&op=snapshot&page=' + p + '&anchor=' + first.head);
        if (gen !== snapGen.current) return;
        commits = commits.concat(next.commits); hasMore = next.hasMore; loaded = p + 1;
      }
      if (gen !== snapGen.current) return;
      liveKey.current = first.liveKey;
      const next = { ...first, commits, hasMore };
      snapRef.current = next; setSnapshot(next); setPagesNow(loaded); setError('');
      setWatcher({ state: first.liveState, error: first.liveError });
    } catch (e) {
      if (gen !== snapGen.current) return;
      const data = e instanceof ApiError && e.data && typeof e.data === 'object' ? e.data as { liveKey?: string; liveState?: string } : null;
      if (data?.liveKey) { liveKey.current = data.liveKey; setWatcher({ state: data.liveState, error: errorText(e) }); }
      setError(errorText(e));
    } finally {
      if (gen === snapGen.current) {
        setLoading(false);
        if (manual.current) { manual.current = false; say('Repository refreshed'); }
      }
    }
  }, [base]);

  /**
   * Open comments are loaded completely (the backend caps them at 500). Resolved history is loaded newest-first:
   * its exact total is found by probing one-row pages, then only the newest pages (plus older pages the person
   * explicitly asked for) are fetched in parallel. Any newer reload supersedes this one.
   */
  const loadComments = useCallback(async () => {
    const gen = ++commentGen.current;
    const get = async (status: 'open' | 'resolved', page: number, limit = COMMENT_PAGE) => {
      const r = await requestJson<CommentsPage>(base + '&op=comments&status=' + status + '&limit=' + limit + '&page=' + page);
      if (gen !== commentGen.current) throw new Stale();
      return r;
    };
    const exists = async (offset: number) => (await get('resolved', offset, 1)).comments.length > 0;
    /**
     * Exact resolved total from one-row probes (exists(n) ⇔ more than n rows). Starts at the previous total, so an
     * unchanged history costs two probes; changes gallop outward and finish with a binary search.
     */
    const countResolved = async (lo: number, hint: number) => {
      let hi = Infinity;
      if (hint > lo) {
        if (await exists(hint - 1)) { if (!(await exists(hint))) return hint; lo = hint + 1; }
        else {
          hi = hint - 1;
          for (let step = 1; hi > lo; step *= 2) { const probe = Math.max(lo, hi - step); if (probe === lo) break; if (await exists(probe - 1)) { lo = probe; break; } hi = probe - 1; }
        }
      }
      for (let step = Math.max(1, lo); hi === Infinity; step *= 2) { const probe = lo + step; if (await exists(probe - 1)) lo = probe; else hi = probe - 1; }
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (await exists(mid - 1)) lo = mid; else hi = mid - 1; }
      return lo;
    };
    try {
      const open: ReviewComment[] = [];
      let page: number | null = 0, last: CommentsPage | null = null;
      for (let n = 0; page !== null && n < OPEN_PAGES; n++) { last = await get('open', page); open.push(...last.comments); page = last.nextPage; }
      if (!last) return;
      const hint = resolvedRef.current.total;
      let resolved: ReviewComment[] | null = null, total = 0, first = 0;
      if (hint <= COMMENT_PAGE) {
        const p0 = await get('resolved', 0);
        if (p0.nextPage === null) { resolved = p0.comments; total = p0.comments.length; }
        else total = await countResolved(COMMENT_PAGE + 1, hint);
      } else total = await countResolved(0, hint);
      if (!resolved) {
        const lastPage = Math.floor((total - 1) / COMMENT_PAGE);
        first = Math.max(0, lastPage - resolvedRef.current.depth);
        const pages = await Promise.all(Array.from({ length: lastPage - first + 1 }, (_, i) => get('resolved', first + i)));
        resolved = pages.flatMap(p => p.comments);
      }
      resolvedRef.current.total = total;
      // A comment resolved between the two reads may appear in both; the resolved copy is the newer state.
      const byId = new Map<string, ReviewComment>();
      for (const c of open.concat(resolved)) byId.set(c.id, c);
      setComments([...byId.values()].sort((x, y) => x.created_at - y.created_at));
      setOpenPartial(page !== null);
      setResolvedView({ total, first, older: first * COMMENT_PAGE });
      setCounts({ open: last.openCount, unsent: last.unsentCount }); setCommentsError(''); setCommentsLoaded(true);
    } catch (e) {
      if (e instanceof Stale) return;
      if (gen === commentGen.current) { setCommentsError(errorText(e)); setCommentsLoaded(true); }
    }
  }, [base]);
  /** Fetch one older page of resolved comments on request; a concurrent reload re-reads it at the new depth. */
  const loadOlder = async () => {
    if (loadingOlder || resolvedView.first === 0) return;
    const gen = commentGen.current, page = resolvedView.first - 1;
    setLoadingOlder(true);
    try {
      const r = await requestJson<CommentsPage>(base + '&op=comments&status=resolved&limit=' + COMMENT_PAGE + '&page=' + page);
      resolvedRef.current.depth++;
      if (gen !== commentGen.current) { void loadComments(); return; }
      setComments(c => [...r.comments.filter(x => !c.some(y => y.id === x.id)), ...c].sort((x, y) => x.created_at - y.created_at));
      setResolvedView(v => ({ ...v, first: page, older: page * COMMENT_PAGE }));
      say(`Loaded ${r.comments.length} older resolved comments`);
    } catch (e) {
      setCommentsError(errorText(e));
    } finally { setLoadingOlder(false); }
  };

  const refresh = useCallback((silent: boolean) => { void loadSnapshot(silent); void loadComments(); setTick(t => t + 1); }, [loadSnapshot, loadComments]);
  useEffect(() => { refresh(false); }, [refresh]);
  // Snapshot requests keep the shared watcher alive; a visible tab catches up when shown again.
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void loadSnapshot(true); }, KEEP_ALIVE_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [loadSnapshot, refresh]);

  useLiveSubscription({
    name: 'git-repository-' + item.id, types: ['gitUi.changed', 'gitUi.comments.changed'],
    onEvent: event => {
      setSubscriptionError(false); setTransport('connected');
      const key = (event as { key?: unknown }).key;
      if (!liveKey.current || key !== liveKey.current) return;
      if (event.type === 'gitUi.comments.changed') { void loadComments(); return; }
      refresh(true);
      if (Date.now() - lastAnnounce.current > 10000) { lastAnnounce.current = Date.now(); say('Repository updated'); }
    },
    resync: () => { setSubscriptionError(false); setTransport(window.mauzcodeLive?.getStatus?.() ?? 'connected'); refresh(true); },
    onError: () => setSubscriptionError(true),
  });
  const live = indicatorOf(transport, subscriptionError, watcher.state);
  const prevLive = useRef(live);
  useEffect(() => { if (prevLive.current !== live) { prevLive.current = live; say(live === 'live' ? 'Live updates on' : live === 'stopped' ? 'Live updates unavailable — use Refresh' : 'Connecting to live updates'); } }, [live]);

  // Commit file list (immutable; refetched only when the commit changes).
  useEffect(() => {
    if (!hash) { setCommit(null); return; }
    let alive = true;
    setCommitError('');
    setCommit(c => c?.hash === hash ? c : null);
    requestJson<CommitFiles>(base + '&op=commit&hash=' + encodeURIComponent(hash)).then(d => { if (alive) setCommit(d); }).catch(e => { if (alive) setCommitError(errorText(e)); });
    return () => { alive = false; };
  }, [base, hash]);

  // The diff target: the activated comment in Comments, otherwise the selected file.
  const focused = focusId ? comments.find(c => c.id === focusId) ?? null : null;
  const target: Target | null = section === 'comments' ? (focused ? targetOf(focused) : null) : selection && (section === 'history' ? selection.group === 'commit' && selection.hash === hash : selection.group !== 'commit') ? selection : null;
  const tKey = targetKey(target);
  const vanished = !!target && target.group !== 'commit' && !!snapshot && !snapshot.files.some(f => f.path === target.path && f.group === target.group);
  const targetFile: GitFile | undefined = target ? (target.group === 'commit' ? commit && commit.hash === target.hash ? commit.files.find(f => f.path === target.path) : undefined : snapshot?.files.find(f => f.path === target.path && f.group === target.group)) : undefined;
  // Live refresh keeps the shown patch until the new one arrives, preserving scroll.
  useEffect(() => {
    if (!target || vanished) { setDiffError(''); return; }
    let alive = true;
    setDiffError('');
    setPatch(p => p?.key === tKey ? p : null);
    requestJson<Patch>(base + '&op=diff&path=' + encodeURIComponent(target.path) + '&group=' + target.group + (target.group === 'commit' ? '&hash=' + encodeURIComponent(target.hash ?? '') : ''))
      .then(d => { if (alive) setPatch({ key: tKey, data: d }); }).catch(e => { if (alive) setDiffError(errorText(e)); });
    return () => { alive = false; };
  }, [base, tKey, vanished, target?.group === 'commit' ? 0 : tick]);

  const post = useCallback(async <T,>(op: string, body: object): Promise<T> => {
    const result = await requestJson<T>(base + '&op=' + op, { method: 'POST', body });
    void loadComments();
    return result;
  }, [base, loadComments]);
  const actions: CommentActions = useMemo(() => ({
    update: async (id, body) => { await post('commentUpdate', { id, body }); },
    remove: async id => { await post('commentDelete', { id }); say('Comment deleted'); },
    resolve: async id => { await post('commentResolve', { id }); say('Comment resolved'); },
    reopen: async id => { await post('commentReopen', { id }); say('Comment reopened'); },
  }), [post]);
  const create = async (anchor: Anchor, body: string) => { await post('commentCreate', { anchor, body }); say('Comment added'); };
  const send = async () => {
    if (sendingRef.current || counts.unsent === 0) return;
    sendingRef.current = true; setSending(true); setSendStatus(null);
    try {
      const r = await requestJson<{ sent: number }>(base + '&op=commentsSend', { method: 'POST', body: {} });
      const text = r.sent ? `Sent ${r.sent} ${r.sent === 1 ? 'comment' : 'comments'} to the agent` : 'Nothing new to send';
      setSendStatus({ kind: 'ok', text }); say(text);
    } catch (e) {
      const text = 'Not sent: ' + errorText(e);
      setSendStatus({ kind: 'error', text }); say(text);
    } finally { sendingRef.current = false; setSending(false); void loadComments(); }
  };
  useEffect(() => { if (!sendStatus) return; const t = setTimeout(() => setSendStatus(null), sendStatus.kind === 'ok' ? 5000 : 9000); return () => clearTimeout(t); }, [sendStatus]);

  /** Append the next history page for the HEAD it was requested with; discarded if HEAD or paging moved meanwhile. */
  const loadMore = async () => {
    if (!snapshot?.hasMore || loadingMore || pages > MAX_HISTORY_PAGE) return;
    const anchor = snapshot.head, at = pages;
    setLoadingMore(true);
    try {
      const next = await requestJson<Snapshot>(base + '&op=snapshot&page=' + at + '&anchor=' + anchor);
      const cur = snapRef.current;
      if (!cur || cur.head !== anchor || pagesRef.current !== at) return;
      const merged = { ...cur, commits: cur.commits.concat(next.commits), hasMore: next.hasMore };
      snapRef.current = merged; setSnapshot(merged); setPagesNow(at + 1);
    } catch (e) {
      if (/History changed/i.test(errorText(e))) refresh(true); else setError(errorText(e));
    } finally { setLoadingMore(false); }
  };

  const switchSection = (next: Section) => {
    if (next === section) return;
    setSection(next); setOpen(false);
    save({ section: next });
  };
  const pickFile = (file: GitFile, group: Group | 'commit') => {
    const t: Target = group === 'commit' ? { path: file.path, group, hash: hash ?? '' } : { path: file.path, group };
    setSelection(t); setOpen(true);
    save({ path: t.path, group: t.group, hash: t.hash ?? hash });
  };
  const pickCommit = (c: Commit) => {
    if (c.hash !== hash) { setHash(c.hash); setSelection(null); save({ hash: c.hash, path: null, group: null }); }
  };
  const pickComment = (c: ReviewComment) => { setFocusId(c.id); setOpen(true); save({ comment: c.id }); };
  const pickFilter = (f: Filter) => { setFilter(f); save({ filter: f }); };

  // Resolved comments leave the Open list with a short transition (skipped under reduced motion). Each leaving
  // item has its own timer, so a second refresh cannot cancel an earlier one; all timers are cleared on unmount.
  const [leaving, setLeaving] = useState<ReviewComment[]>([]);
  const prevComments = useRef<ReviewComment[]>([]);
  const leaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const before = prevComments.current; prevComments.current = comments;
    if (filter !== 'open' || prefersReducedMotion()) return;
    const gone = before.filter(b => b.status === 'open' && !comments.some(c => c.id === b.id && c.status === 'open') && !leaveTimers.current.has(b.id));
    if (!gone.length) return;
    setLeaving(l => [...l, ...gone.filter(g => !l.some(x => x.id === g.id))]);
    for (const g of gone) leaveTimers.current.set(g.id, setTimeout(() => {
      leaveTimers.current.delete(g.id);
      setLeaving(l => l.filter(x => x.id !== g.id));
    }, 320));
  }, [comments]);
  useEffect(() => () => { for (const t of leaveTimers.current.values()) clearTimeout(t); leaveTimers.current.clear(); }, []);

  const name = (snapshot?.root || dir).split('/').filter(Boolean).pop() || dir || 'Repository';
  const files = snapshot?.files ?? [];
  const fileSections = GROUPS.map(g => ({ id: g, label: <>{GROUP_LABEL[g]} <span className="git-group-count">{files.filter(f => f.group === g).length}</span></>, items: files.filter(f => f.group === g) })).filter(s => s.items.length);
  const fileRow = (file: GitFile, group: Group | 'commit', hashFor?: string) => {
    const n = openCountFor(comments, c => c.path === file.path && (group === 'commit' ? c.scope === 'commit' && c.commit_hash === hashFor : c.scope === 'worktree' && c.worktree_group === group));
    return <span className="git-row">
      <StatusGlyph status={file.status} />
      <span className="git-row-text"><strong>{fileName(file.path)}</strong>
        <small>{file.oldPath ? fileName(file.oldPath) + ' → ' : ''}{fileDir(file.path)}{file.special ? ' · ' + file.special : ''}</small></span>
      <CountBadge n={n} />
    </span>;
  };
  const visible = filterComments(comments, filter);
  const listed = [...visible, ...leaving.filter(l => !visible.some(v => v.id === l.id))].sort((a, b) => a.created_at - b.created_at);
  const leavingIds = new Set(leaving.map(l => l.id));
  const filterCount = (f: Filter) => f === 'open' ? counts.open : f === 'resolved' ? resolvedView.total : counts.open + resolvedView.total;
  const filterTabs = useRef<(HTMLButtonElement | null)[]>([]);
  const onFilterKey = (e: KeyboardEvent, i: number) => {
    const next = moveIndex(e.key, i, FILTERS.length, true);
    if (next === null) return;
    e.preventDefault(); pickFilter(FILTERS[next].id); filterTabs.current[next]?.focus();
  };

  const list = () => {
    if (section === 'changes') {
      if (!snapshot) return error ? null : <Skeleton label="Loading changes" />;
      return <ListBox label="Changed files" sections={fileSections} itemKey={f => (f.group ?? '') + ':' + f.path} selectedKey={selection && selection.group !== 'commit' ? selection.group + ':' + selection.path : null}
        onPick={f => pickFile(f, f.group as Group)} render={f => fileRow(f, f.group as Group)}
        empty={<Empty text="Working tree is clean" detail="Edits appear here automatically." icon={ICONS.check} />} />;
    }
    if (section === 'history') {
      if (!snapshot) return error ? null : <Skeleton label="Loading history" />;
      return <>
        {snapshot.shallow && <p className="git-note">Shallow repository — older history and parents may be unavailable.</p>}
        <ListBox label="Commit history" sections={[{ id: 'commits', items: snapshot.commits }]} itemKey={c => c.hash} selectedKey={hash} onPick={pickCommit}
          render={c => <span className="git-row git-commit-row">
            <span className="git-row-text"><strong>{c.subject || '(no subject)'}</strong>
              <small><code>{shortHash(c.hash)}</code> · {c.author} · <time dateTime={c.date} title={c.date}>{relativeDate(c.date)}</time></small></span>
            <CountBadge n={openCountFor(comments, x => x.scope === 'commit' && x.commit_hash === c.hash)} />
          </span>}
          empty={<Empty text="No commits yet" />} />
        {snapshot.hasMore && pages > MAX_HISTORY_PAGE && <p className="git-note" role="note">Showing the latest {(snapshot.commits.length).toLocaleString('en-US')} commits, the most this view can load. Use git log for older history.</p>}
        {snapshot.hasMore && pages <= MAX_HISTORY_PAGE && <button type="button" className="git-btn git-more" onClick={() => void loadMore()} disabled={loadingMore} aria-busy={loadingMore || undefined}>
          {loadingMore && <span className="git-spinner" aria-hidden="true" />}{loadingMore ? 'Loading…' : 'Load more'}</button>}
        {hash && <section className="git-commit-files" aria-label={'Files in commit ' + shortHash(hash)}>
          <h3><code>{shortHash(hash)}</code> {commit?.hash === hash && <span className="git-hint">{commit.comparison}</span>}</h3>
          {snapshot && !snapshot.hasMore && !snapshot.commits.some(c => c.hash === hash) && <p className="git-note" role="status">This commit is no longer in the current branch history.</p>}
          {commitError ? <Alert text={commitError} /> : commit?.hash !== hash ? <Skeleton label="Loading commit" rows={3} />
            : <ListBox label={'Files changed in ' + shortHash(hash)} sections={[{ id: 'commit', items: commit.files }]} itemKey={f => f.path}
                selectedKey={selection?.group === 'commit' && selection.hash === hash ? selection.path : null} onPick={f => pickFile(f, 'commit')} render={f => fileRow(f, 'commit', hash)}
                empty={<Empty text="This commit changes no files" />} />}
        </section>}
      </>;
    }
    return <>
      <div className="git-filter" role="tablist" aria-label="Comment filter">
        {FILTERS.map((f, i) => <button key={f.id} type="button" role="tab" ref={el => { filterTabs.current[i] = el; }} aria-selected={filter === f.id} tabIndex={filter === f.id ? 0 : -1}
          onClick={() => pickFilter(f.id)} onKeyDown={e => onFilterKey(e, i)}>{f.label} <span className="git-filter-count">{filterCount(f.id)}</span></button>)}
      </div>
      {commentsError && <Alert text={commentsError} onRetry={() => void loadComments()} />}
      {!commentsLoaded ? <Skeleton label="Loading comments" />
        : <ListBox label={FILTERS.find(f => f.id === filter)!.label + ' comments'} className="git-comment-list"
            sections={byFile(listed).map(([path, items]) => ({ id: path, label: <><Icon d={ICONS.file} size={12} />{path}</>, items }))}
            itemKey={c => c.id} selectedKey={focusId} onPick={pickComment} ghost={c => leavingIds.has(c.id)}
            render={c => <span className="git-comment-item" data-leaving={leavingIds.has(c.id) || undefined}>
              <span className="git-comment-item-head"><CommentChips comment={c} /><span className="git-hint">{rangeLabel(c)} · {c.scope === 'commit' ? shortHash(c.commit_hash) : c.worktree_group}</span></span>
              <span className="git-comment-excerpt">{c.body}</span>
              {c.resolution_note && <span className="git-resolution-note">{c.resolved_by === 'agent' ? 'Agent: ' : 'Note: '}{c.resolution_note}</span>}
            </span>}
            empty={<Empty icon={ICONS.comment} text={filter === 'open' ? 'No open comments' : filter === 'resolved' ? 'Nothing resolved yet' : 'No comments yet'}
              detail={filter === 'resolved' ? 'Resolved comments stay here for reference.' : 'Select lines in any diff to start a review.'} />} />}
      {commentsLoaded && openPartial && filter !== 'resolved' && <p className="git-note" role="note">Showing {comments.filter(c => c.status === 'open').length} of {counts.open} open comments.</p>}
      {commentsLoaded && filter !== 'open' && resolvedView.older > 0 && <div className="git-older">
        <p className="git-note" id="git-older-note">Showing the newest {resolvedView.total - resolvedView.older} of {resolvedView.total} resolved comments; {resolvedView.older} older {resolvedView.older === 1 ? 'is' : 'are'} not loaded.</p>
        <button type="button" className="git-btn git-more" onClick={() => void loadOlder()} disabled={loadingOlder} aria-busy={loadingOlder || undefined} aria-describedby="git-older-note">
          {loadingOlder && <span className="git-spinner" aria-hidden="true" />}{loadingOlder ? 'Loading…' : 'Load older resolved comments'}</button>
      </div>}
    </>;
  };

  const targetComments = target ? comments.filter(c => commentMatches(c, target)) : [];
  const diffPane = () => {
    if (!target) return <Empty icon={section === 'comments' ? ICONS.comment : ICONS.file} text={section === 'comments' ? (focusId && commentsLoaded ? (resolvedView.older > 0 ? 'This comment is not loaded. It may be an older resolved comment — load older resolved comments to find it.' : 'This comment no longer exists.') : 'Select a comment to open its lines.') : section === 'history' && !hash ? 'Select a commit to see its files.' : 'Select a file to see its diff.'} />;
    if (vanished) return <Empty icon={ICONS.check} text={`${target.path} no longer has ${GROUP_LABEL[target.group as Group].toLowerCase()} changes.`} detail={targetComments.length ? 'Its comments remain under Comments.' : undefined} />;
    if (diffError) return <Alert text={diffError} onRetry={() => setTick(t => t + 1)} />;
    if (!patch || patch.key !== tKey) return <Skeleton label="Loading diff" rows={8} />;
    if (patch.data.state !== 'text') return <Empty text={patch.data.message || 'No textual changes.'} />;
    return <DiffView patch={patch.data.patch} target={target} oldPath={targetFile?.oldPath ?? focused?.old_path ?? null} split={split} comments={targetComments}
      actions={actions} readOnly={readOnly} focusComment={section === 'comments' ? focused : null} onCreate={create} />;
  };

  return <section className="git-view" data-theme={context.theme}><style>{styles}</style>
    <Header name={name} dir={dir} host={host} branch={snapshot?.branch} head={snapshot?.head} section={section} onSection={switchSection} openCount={counts.open}
      live={live} refreshing={loading} onRefresh={() => { manual.current = true; refresh(false); }} unsent={counts.unsent} sending={sending} sendStatus={sendStatus} onSend={() => void send()} readOnly={readOnly} />
    <div className="git-sr" role="status" aria-live="polite" aria-atomic="true">{announce}</div>
    {live === 'stopped' && <p className="git-note git-live-note">Live updates are unavailable{watcher.error ? ' (' + watcher.error + ')' : ''}. Use Refresh to update.</p>}
    {error && <Alert text={error} onRetry={() => refresh(false)} />}
    <div className="git-body" id="git-panel" role="tabpanel" aria-labelledby={'git-tab-' + section} data-open={open}>
      <aside className="git-list-pane" aria-label={section === 'changes' ? 'Changed files' : section === 'history' ? 'Commit history' : 'Review comments'}>{list()}</aside>
      <main className="git-diff-pane" aria-label="Diff">
        <div className="git-diff-head">
          <button type="button" className="git-icon-btn git-back" onClick={() => setOpen(false)} aria-label="Back to list"><Icon d={ICONS.back} size={16} /></button>
          <div className="git-diff-title">{target ? <><span className="git-eyebrow">{target.group === 'commit' ? 'Commit ' + shortHash(target.hash) : GROUP_LABEL[target.group]}</span><h3>{target.path}</h3></> : <h3>Diff</h3>}</div>
          {target && <button type="button" className="git-btn git-btn-quiet" aria-pressed={split} onClick={() => { setSplit(!split); save({ split: !split }); }}>{split ? 'Split' : 'Unified'}</button>}
        </div>
        <div className="git-diff-scroll">{diffPane()}</div>
      </main>
    </div>
  </section>;
}

const extension: UiExtension = {
  id: 'git', apiVersion: 1,
  canvasLaunchers: [{ id: 'git', title: 'Git', description: 'Project changes, history and review comments', component: Launcher }],
  canvasKinds: [{ kind: 'gitUi.repository', component: Repository }],
};
export default extension;
