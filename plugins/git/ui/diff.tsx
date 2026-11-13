import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Diff, Hunk, tokenize, type ChangeData, type GutterOptions } from 'react-diff-view';
import refractor from 'refractor';
import { CommentCard, Composer, type CommentActions } from './comments';
import { buildAnchor, endKey, extendRange, parsePatch, rangeKeys, rangeLabel, sideRows, validRange, type Anchor, type Range, type ReviewComment, type Row, type Side, type Target } from './model';

const LANGUAGES: Record<string, string> = { ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript', json: 'json', py: 'python', sh: 'bash', md: 'markdown', yml: 'yaml', yaml: 'yaml', clj: 'clojure', cljs: 'clojure', css: 'css', html: 'markup', go: 'go', rs: 'rust', java: 'java', rb: 'ruby', sql: 'sql' };
const lineOf = (change: ChangeData, side: Side): number | undefined => change.type === 'normal' ? (side === 'old' ? change.oldLineNumber : change.newLineNumber) : change.type === (side === 'old' ? 'delete' : 'insert') ? change.lineNumber : undefined;

type Selection = { range: Range; anchor: number; composing: boolean };
export type DiffViewProps = {
  patch: string; target: Target; oldPath: string | null; split: boolean;
  comments: ReviewComment[]; actions: CommentActions; readOnly: boolean;
  /** Comment to scroll to and highlight (from the Comments list). */
  focusComment: ReviewComment | null;
  onCreate: (anchor: Anchor, body: string) => Promise<void>;
};

/** Highlighted diff with keyboard/mouse range selection, inline composer and inline comment widgets. */
export function DiffView({ patch, target, oldPath, split, comments, actions, readOnly, focusComment, onCreate }: DiffViewProps) {
  const parsed = useMemo(() => { try { return parsePatch(patch); } catch { return null; } }, [patch]);
  const rows = parsed?.rows ?? [];
  const [sel, setSel] = useState<Selection | null>(null);
  const [cursor, setCursor] = useState<{ side: Side; line: number } | null>(null);
  const drag = useRef<{ side: Side; anchor: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const targetKey = target.group + ':' + (target.hash ?? '') + ':' + target.path;
  // A different file drops selection; a live refresh keeps it only while the range still exists.
  useEffect(() => { setSel(null); setCursor(null); }, [targetKey]);
  useEffect(() => { setSel(s => s && validRange(rows, s.range) ? s : null); }, [patch]);

  const firstRow = rows.find(r => r.new !== undefined) ?? rows[0];
  const focusLine = cursor ?? (sel ? { side: sel.range.side, line: sel.range.start } : firstRow ? { side: firstRow.new !== undefined ? 'new' as Side : 'old' as Side, line: (firstRow.new ?? firstRow.old)! } : null);
  const gutter = (side: Side, line: number) => root.current?.querySelector<HTMLButtonElement>(`button[data-gutter="${side}:${line}"]`);
  const focusGutter = (side: Side, line: number) => { setCursor({ side, line }); requestAnimationFrame(() => gutter(side, line)?.focus()); };

  useEffect(() => {
    const up = () => {
      const d = drag.current; drag.current = null;
      if (!d) return;
      dragged.current = d.moved;
      if (d.moved) setSel(s => s ? { ...s, composing: true } : s);
    };
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, []);
  // Jump: scroll to the comment's range once its lines are rendered.
  const highlight = focusComment && validRange(rows, { side: focusComment.side, start: focusComment.line_start, end: focusComment.line_end }) ? { side: focusComment.side, start: focusComment.line_start, end: focusComment.line_end } : null;
  useEffect(() => {
    if (!focusComment) return;
    const key = highlight ? endKey(rows, highlight) : undefined;
    const el = (key && root.current?.querySelector(`[data-change-key="${key}"]`)) || root.current?.querySelector(`[data-comment-id="${focusComment.id}"]`);
    el?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  }, [focusComment?.id, patch]);

  const start = (side: Side, line: number, e: MouseEvent) => {
    if (readOnly || e.button !== 0 || e.shiftKey) return;
    e.preventDefault();
    drag.current = { side, anchor: line, moved: false };
    setCursor({ side, line });
    setSel({ range: { side, start: line, end: line }, anchor: line, composing: false });
  };
  const enter = (side: Side, line: number) => {
    const d = drag.current;
    if (!d || d.side !== side) return;
    d.moved = d.moved || line !== d.anchor;
    setSel({ range: extendRange(rows, side, d.anchor, line), anchor: d.anchor, composing: false });
  };
  const click = (side: Side, line: number, e: MouseEvent) => {
    if (readOnly) return;
    if (dragged.current) { dragged.current = false; return; }
    setCursor({ side, line });
    if (e.shiftKey && sel && sel.range.side === side) setSel({ range: extendRange(rows, side, sel.anchor, line), anchor: sel.anchor, composing: true });
    else setSel({ range: { side, start: line, end: line }, anchor: line, composing: true });
  };
  const onKey = (side: Side, line: number, e: KeyboardEvent) => {
    const list = sideRows(rows, side), index = list.findIndex(r => r[side] === line);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const next = e.key === 'Home' ? list[0] : e.key === 'End' ? list[list.length - 1] : list[index + (e.key === 'ArrowDown' ? 1 : -1)];
      if (!next) return;
      const n = next[side]!;
      if (e.shiftKey && !readOnly) {
        const anchor = sel && sel.range.side === side && !sel.composing ? sel.anchor : line;
        setSel({ range: extendRange(rows, side, anchor, n), anchor, composing: false });
      }
      focusGutter(side, n);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const other: Side = e.key === 'ArrowLeft' ? 'old' : 'new';
      if (other !== side && rows.some(r => r[other] === line || (r[side] === line && r[other] !== undefined))) {
        e.preventDefault();
        const row = rows.find(r => r[side] === line)!;
        if (row[other] !== undefined) focusGutter(other, row[other]!);
      }
    } else if ((e.key === 'Enter' || e.key === ' ') && !readOnly) {
      e.preventDefault();
      if (sel && !sel.composing && sel.range.side === side && line >= sel.range.start && line <= sel.range.end) setSel({ ...sel, composing: true });
      else setSel({ range: { side, start: line, end: line }, anchor: line, composing: true });
    } else if (e.key === 'Escape' && sel && !sel.composing) { e.preventDefault(); setSel(null); }
  };
  const renderGutter = ({ change, side, renderDefault }: GutterOptions) => {
    const line = lineOf(change, side);
    if (line === undefined) return renderDefault();
    const inRange = !!sel && sel.range.side === side && line >= sel.range.start && line <= sel.range.end;
    const tab = focusLine && focusLine.side === side && focusLine.line === line ? 0 : -1;
    return <button type="button" className="git-gutter-btn" data-gutter={side + ':' + line} tabIndex={tab} aria-pressed={inRange}
      aria-label={(readOnly ? '' : 'Comment on ') + (side === 'old' ? 'old' : 'new') + ' line ' + line}
      onMouseDown={e => start(side, line, e)} onMouseEnter={() => enter(side, line)} onClick={e => click(side, line, e)} onKeyDown={e => onKey(side, line, e)} onFocus={() => setCursor({ side, line })}>
      <span className="git-gutter-num">{line}</span>{!readOnly && <span className="git-gutter-plus" aria-hidden="true">+</span>}
    </button>;
  };

  const cancel = () => { const r = sel?.range; setSel(null); if (r) focusGutter(r.side, r.start); };
  const save = async (body: string) => {
    if (!sel) return;
    const r = sel.range;
    await onCreate(buildAnchor(target, oldPath, rows, r), body);
    setSel(null); focusGutter(r.side, r.end);
  };
  const inline: ReviewComment[] = [], detached: ReviewComment[] = [];
  for (const c of comments) (!c.outdated && validRange(rows, { side: c.side, start: c.line_start, end: c.line_end }) ? inline : detached).push(c);
  const widgets = useWidgets(rows, inline, sel, { actions, readOnly, focusId: focusComment?.id, save, cancel });
  const selected = [...rangeKeys(rows, sel?.range ?? null), ...rangeKeys(rows, highlight)];
  const tokens = useMemo(() => {
    const language = LANGUAGES[target.path.split('.').pop()?.toLowerCase() ?? ''];
    if (!parsed || !language || !refractor.registered(language)) return undefined;
    try { return parsed.files.map(f => tokenize(f.hunks, { highlight: true, refractor, language })); } catch { return undefined; }
  }, [parsed, target.path]);

  if (!parsed) return <pre className="git-raw">{patch}</pre>;
  return <div className="git-patch" ref={root} data-selecting={!!sel || undefined}>
    {detached.length > 0 && <section className="git-detached" aria-label="Comments not anchored in the current diff">
      <h4>Not in the current diff <span className="git-hint">— lines changed since these comments were written</span></h4>
      {detached.map(c => <div key={c.id} data-comment-id={c.id}><CommentCard comment={c} actions={actions} readOnly={readOnly} highlighted={c.id === focusComment?.id} /></div>)}
    </section>}
    {sel && !sel.composing && <p className="git-hint git-select-hint" role="status">{rangeLabel({ side: sel.range.side, line_start: sel.range.start, line_end: sel.range.end })} selected — press Enter to comment, Esc to clear</p>}
    {parsed.files.map((file, index) => <Diff key={index} viewType={split ? 'split' : 'unified'} diffType={file.type} hunks={file.hunks} tokens={tokens?.[index]}
      renderGutter={renderGutter} selectedChanges={selected} widgets={widgets} optimizeSelection={false}>
      {hunks => hunks.map(hunk => <Hunk key={hunk.content} hunk={hunk} />)}
    </Diff>)}
  </div>;
}

function useWidgets(rows: Row[], inline: ReviewComment[], sel: Selection | null, o: { actions: CommentActions; readOnly: boolean; focusId?: string; save: (body: string) => Promise<void>; cancel: () => void }) {
  const out: Record<string, ReactNode[]> = {};
  const push = (key: string | undefined, node: ReactNode) => { if (key) (out[key] ??= []).push(node); };
  for (const c of inline) push(endKey(rows, { side: c.side, start: c.line_start, end: c.line_end }), <div key={c.id} data-comment-id={c.id}><CommentCard comment={c} actions={o.actions} readOnly={o.readOnly} highlighted={c.id === o.focusId} /></div>);
  if (sel?.composing && !o.readOnly) push(endKey(rows, sel.range), <div key="composer" className="git-composer-wrap">
    <p className="git-hint">New comment on {rangeLabel({ side: sel.range.side, line_start: sel.range.start, line_end: sel.range.end })}</p>
    <Composer key={sel.range.side + sel.range.start + '-' + sel.range.end} label={'Comment on ' + rangeLabel({ side: sel.range.side, line_start: sel.range.start, line_end: sel.range.end })} saveLabel="Comment" onSave={o.save} onCancel={o.cancel} />
  </div>);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, <div className="git-widget">{v}</div>]));
}
