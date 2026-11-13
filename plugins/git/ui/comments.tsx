import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { bytes, errorText, rangeLabel, shortHash, type ReviewComment } from './model';

export type CommentActions = {
  update: (id: string, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  resolve: (id: string) => Promise<void>;
  reopen: (id: string) => Promise<void>;
};
const MAX = 8192;
const mod = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/** Autosizing textarea editor: Cmd/Ctrl+Enter saves, Escape cancels. */
export function Composer({ label, initial = '', saveLabel, onSave, onCancel, disabledReason }: {
  label: string; initial?: string; saveLabel: string;
  onSave: (body: string) => Promise<void>; onCancel: () => void; disabledReason?: string;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const size = bytes(text), empty = !text.trim(), tooLong = size > MAX;
  useEffect(() => { area.current?.focus(); }, []);
  useLayoutEffect(() => { const el = area.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 320) + 'px'; }, [text]);
  const save = async () => {
    if (busy || empty || tooLong || disabledReason) return;
    setBusy(true); setError('');
    try { await onSave(text); } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
  };
  return <div className="git-composer" onKeyDown={onKey}>
    <textarea ref={area} aria-label={label} value={text} rows={2} placeholder="Leave a comment for the agent…" disabled={busy}
      aria-invalid={tooLong || undefined} onChange={e => setText(e.target.value)} />
    {(error || disabledReason) && <p className="git-inline-alert" role="alert">{error || disabledReason}</p>}
    <div className="git-composer-bar">
      <span className="git-hint" aria-live="polite">{tooLong ? `Too long: ${size} of ${MAX} bytes` : `${mod()}+Enter to save · Esc to cancel`}</span>
      <button type="button" className="git-btn" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className="git-btn git-btn-primary" onClick={() => void save()} disabled={busy || empty || tooLong || !!disabledReason} aria-busy={busy || undefined}>
        {busy && <span className="git-spinner" aria-hidden="true" />}{saveLabel}
      </button>
    </div>
  </div>;
}

/** Text chips; state is conveyed by words and glyphs, never color alone. */
export function CommentChips({ comment }: { comment: ReviewComment }) {
  return <span className="git-chips">
    <span className="git-chip" data-kind={comment.status}>{comment.status === 'open' ? '● Open' : '✓ Resolved'}</span>
    {comment.outdated && <span className="git-chip" data-kind="outdated">⚠ Outdated</span>}
    {comment.status === 'open' && <span className="git-chip" data-kind={comment.sent_at ? 'sent' : 'unsent'}>{comment.sent_at ? '↗ Sent' : 'Not sent'}</span>}
  </span>;
}

/** Plain text body: markdown is shown verbatim (never rendered as HTML). */
export const Body = ({ text }: { text: string }) => <p className="git-comment-body">{text}</p>;

/** Inline comment card with Edit, Delete, Resolve and Reopen. */
export function CommentCard({ comment, actions, readOnly, highlighted }: { comment: ReviewComment; actions: CommentActions; readOnly: boolean; highlighted?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const editButton = useRef<HTMLButtonElement>(null);
  const run = async (name: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(name); setError('');
    try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };
  const where = rangeLabel(comment) + (comment.scope === 'commit' ? ' · commit ' + shortHash(comment.commit_hash) : ' · ' + comment.worktree_group);
  return <article className="git-comment" data-status={comment.status} data-highlight={highlighted || undefined} aria-label={`Comment on ${comment.path}, ${rangeLabel(comment)}`}>
    <header className="git-comment-head"><CommentChips comment={comment} /><span className="git-comment-where">{where}</span></header>
    {editing
      ? <Composer label="Edit comment" initial={comment.body} saveLabel="Save" onCancel={() => { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); }}
          onSave={async body => { await actions.update(comment.id, body); setEditing(false); }} />
      : <Body text={comment.body} />}
    {comment.status === 'resolved' && <p className="git-resolution">
      <span className="git-resolution-by">Resolved by {comment.resolved_by === 'agent' ? 'the agent' : 'you'}</span>
      {comment.resolution_note && <span className="git-resolution-note">{comment.resolution_note}</span>}
    </p>}
    {error && <p className="git-inline-alert" role="alert">{error}</p>}
    {!editing && !readOnly && <div className="git-comment-actions">
      {confirmDelete
        ? <><span className="git-hint">Delete this comment?</span>
            <button type="button" className="git-btn git-btn-danger" disabled={!!busy} onClick={() => void run('delete', () => actions.remove(comment.id))}>{busy === 'delete' && <span className="git-spinner" aria-hidden="true" />}Delete</button>
            <button type="button" className="git-btn" onClick={() => setConfirmDelete(false)} autoFocus>Keep</button></>
        : <>
          {comment.status === 'open'
            ? <button type="button" className="git-btn" disabled={!!busy} onClick={() => void run('resolve', () => actions.resolve(comment.id))}>{busy === 'resolve' && <span className="git-spinner" aria-hidden="true" />}Resolve</button>
            : <button type="button" className="git-btn" disabled={!!busy} onClick={() => void run('reopen', () => actions.reopen(comment.id))}>{busy === 'reopen' && <span className="git-spinner" aria-hidden="true" />}Reopen</button>}
          <button type="button" ref={editButton} className="git-btn git-btn-quiet" disabled={!!busy} onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className="git-btn git-btn-quiet" disabled={!!busy} onClick={() => setConfirmDelete(true)}>Delete</button>
        </>}
    </div>}
  </article>;
}
