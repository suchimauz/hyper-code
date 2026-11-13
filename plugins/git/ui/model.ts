import { parseDiff, getChangeKey, type ChangeData, type FileData } from 'react-diff-view';

export type Group = 'staged' | 'unstaged' | 'untracked';
export type Section = 'changes' | 'history' | 'comments';
export type Filter = 'open' | 'resolved' | 'all';
export type Side = 'old' | 'new';
export type GitFile = { path: string; oldPath?: string; status: string; group?: string; special?: string };
/** Mirrors types.gitUi.CommitRef: one structured HEAD/branch/remote/tag decoration of a commit. */
export type CommitRef = { kind: 'head' | 'branch' | 'remote' | 'tag'; name: string; ref: string; branch?: string; detached?: boolean; current?: boolean; alias?: string; annotated?: boolean };
export type Commit = { hash: string; author: string; date: string; subject: string; parents: string[]; refs?: CommitRef[] };
export type Snapshot = { root: string; branch: string; head: string; shallow: boolean; files: GitFile[]; commits: Commit[]; hasMore: boolean; page: number; liveKey?: string; liveState?: 'watching' | 'polling' | 'error'; liveError?: string; refsKey?: string; refsError?: string; refsTruncated?: boolean };
/** Response of the authorized op=refs read (types.gitUi.CommitRef lists keyed by full commit ID). */
export type RefsLookup = { byCommit: Record<string, CommitRef[]>; key: string; truncated: boolean; error?: string };
export type CommitFiles = { hash: string; parent?: string; comparison: string; files: GitFile[] };
export type Patch = { patch: string; state: string; message: string };
/** Mirrors the backend ReviewComment view (types.gitUi.ReviewComment). */
export type ReviewComment = {
  id: string; path: string; old_path: string | null; side: Side; line_start: number; line_end: number; line_text: string;
  scope: 'commit' | 'worktree'; commit_hash: string | null; worktree_group: Group | null;
  body: string; status: 'open' | 'resolved'; resolution_note: string | null; resolved_by: 'user' | 'agent' | null;
  sent_at: number | null; resolved_at: number | null; created_at: number; updated_at: number; outdated: boolean;
};
export type CommentsPage = { comments: ReviewComment[]; openCount: number; unsentCount: number; nextPage: number | null };
export type Anchor = Pick<ReviewComment, 'path' | 'old_path' | 'side' | 'line_start' | 'line_end' | 'line_text' | 'scope' | 'commit_hash' | 'worktree_group'>;
/** The diff currently shown: worktree group or a commit. */
export type Target = { path: string; group: Group | 'commit'; hash?: string };
export type Range = { side: Side; start: number; end: number };

export const GROUPS: Group[] = ['staged', 'unstaged', 'untracked'];
export const GROUP_LABEL: Record<Group, string> = { staged: 'Staged', unstaged: 'Unstaged', untracked: 'Untracked' };
export const STATUS_LABEL: Record<string, string> = { A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed', C: 'Copied', T: 'Type changed', U: 'Conflict' };
export const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
export const shortHash = (hash: string | null | undefined) => (hash ?? '').slice(0, 8);
export const bytes = (text: string) => new TextEncoder().encode(text).length;

/** Next index for arrow/Home/End keys, or null for other keys. */
export function moveIndex(key: string, index: number, count: number, horizontal: boolean): number | null {
  if (!count) return null;
  const prev = horizontal ? 'ArrowLeft' : 'ArrowUp', next = horizontal ? 'ArrowRight' : 'ArrowDown';
  if (key === prev) return (index - 1 + count) % count;
  if (key === next) return (index + 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** Relative English date for history rows; absolute ISO date stays in the title. */
export function relativeDate(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.slice(0, 10);
  const m = Math.round((now - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' h ago';
  const d = Math.round(h / 24);
  if (d < 30) return d + (d === 1 ? ' day ago' : ' days ago');
  return iso.slice(0, 10);
}

/** Whether a comment belongs to the diff target currently shown. */
export function commentMatches(c: ReviewComment, t: Target): boolean {
  if (c.path !== t.path) return false;
  return t.group === 'commit' ? c.scope === 'commit' && c.commit_hash === t.hash : c.scope === 'worktree' && c.worktree_group === t.group;
}
export const targetOf = (c: ReviewComment): Target => c.scope === 'commit' ? { path: c.path, group: 'commit', hash: c.commit_hash ?? '' } : { path: c.path, group: c.worktree_group ?? 'unstaged' };

/** One diff row with its per-side line numbers. */
export type Row = { key: string; hunk: number; change: ChangeData; old?: number; new?: number };
export type ParsedDiff = { files: FileData[]; rows: Row[] };

export function parsePatch(patch: string): ParsedDiff {
  const files = parseDiff(patch);
  const rows: Row[] = [];
  let hunk = 0;
  for (const file of files) for (const h of file.hunks) {
    for (const change of h.changes) {
      const row: Row = { key: getChangeKey(change), hunk, change };
      if (change.type === 'normal') { row.old = change.oldLineNumber; row.new = change.newLineNumber; }
      else if (change.type === 'delete') row.old = change.lineNumber;
      else row.new = change.lineNumber;
      rows.push(row);
    }
    hunk++;
  }
  return { files, rows };
}
/** Rows having a line on the given side, in display order. */
export const sideRows = (rows: Row[], side: Side) => rows.filter(r => r[side] !== undefined);
export const rowAt = (rows: Row[], side: Side, line: number) => rows.find(r => r[side] === line);

/** A range is valid when every line exists on that side within one hunk. */
export function validRange(rows: Row[], r: Range): boolean {
  const first = rowAt(rows, r.side, r.start);
  if (!first || r.end < r.start) return false;
  for (let n = r.start; n <= r.end; n++) { const row = rowAt(rows, r.side, n); if (!row || row.hunk !== first.hunk) return false; }
  return true;
}
/** Extend from an anchor line to a target line on the same side; a cross-hunk target restarts at that line. */
export function extendRange(rows: Row[], side: Side, anchor: number, line: number): Range {
  const r = { side, start: Math.min(anchor, line), end: Math.max(anchor, line) };
  return validRange(rows, r) ? r : { side, start: line, end: line };
}
/** Exact captured text of a range, matching the server's diff line extraction. */
export function rangeText(rows: Row[], r: Range): string {
  const out: string[] = [];
  for (let n = r.start; n <= r.end; n++) out.push(rowAt(rows, r.side, n)?.change.content ?? '');
  return out.join('\n');
}
/** Change keys for highlighting a range. */
export function rangeKeys(rows: Row[], r: Range | null): string[] {
  if (!r) return [];
  return rows.filter(row => { const n = row[r.side]; return n !== undefined && n >= r.start && n <= r.end; }).map(row => row.key);
}
export const endKey = (rows: Row[], r: Range) => rowAt(rows, r.side, r.end)?.key;

export function buildAnchor(t: Target, oldPath: string | null, rows: Row[], r: Range): Anchor {
  const base = { path: t.path, old_path: oldPath, side: r.side, line_start: r.start, line_end: r.end, line_text: rangeText(rows, r) };
  return t.group === 'commit'
    ? { ...base, scope: 'commit', commit_hash: t.hash ?? '', worktree_group: null }
    : { ...base, scope: 'worktree', commit_hash: null, worktree_group: t.group };
}
export const rangeLabel = (c: { side: Side; line_start: number; line_end: number }) =>
  (c.side === 'old' ? 'old ' : '') + (c.line_start === c.line_end ? 'line ' + c.line_start : 'lines ' + c.line_start + '–' + c.line_end);

/** Group comments by path, preserving first-seen order. */
export function byFile(list: ReviewComment[]): [string, ReviewComment[]][] {
  const map = new Map<string, ReviewComment[]>();
  for (const c of list) { const l = map.get(c.path); if (l) l.push(c); else map.set(c.path, [c]); }
  return [...map];
}
export const filterComments = (list: ReviewComment[], f: Filter) => f === 'all' ? list : list.filter(c => c.status === f);
export const openCountFor = (list: ReviewComment[], pred: (c: ReviewComment) => boolean) => list.filter(c => c.status === 'open' && pred(c)).length;
export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const REF_KIND: Record<CommitRef['kind'], string> = { head: 'HEAD', branch: 'Branch', remote: 'Remote branch', tag: 'Tag' };
/** Visible badge text for a reference, like git log --decorate: "HEAD -> main", "HEAD", "origin/HEAD -> origin/main". */
export function refText(r: CommitRef): string {
  if (r.kind === 'head') return r.branch ? 'HEAD -> ' + r.branch : 'HEAD';
  return r.alias ? r.name + ' -> ' + r.alias : r.name;
}
/** Full accessible label that names the reference type in words, never relying on colour or glyph alone. */
export function refLabel(r: CommitRef): string {
  if (r.kind === 'head') return r.branch ? 'HEAD, current branch ' + r.branch : 'HEAD, detached';
  const kind = r.kind === 'tag' ? (r.annotated ? 'Annotated tag' : 'Tag') : r.kind === 'branch' && r.current ? 'Current branch' : REF_KIND[r.kind];
  return kind + ' ' + r.name + (r.alias ? ', alias of ' + r.alias : '');
}
