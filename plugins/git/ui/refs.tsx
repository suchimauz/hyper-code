import { Icon, ICONS } from './header';
import { refLabel, refText, type CommitRef } from './model';

const GLYPH: Record<CommitRef['kind'], string> = { head: ICONS.head, branch: ICONS.branch, remote: ICONS.cloud, tag: ICONS.tag };
/** Badges shown inline in a commit row before the rest collapse into "+N". */
export const ROW_REF_LIMIT = 3;

/** One typed reference badge: glyph and shape distinguish the kind besides colour; the full typed label is read as text. */
export function RefBadge({ r }: { r: CommitRef }) {
  return <span className="git-ref" data-kind={r.kind} data-current={r.current || (r.kind === 'head' && !r.detached) || undefined} title={r.ref + (r.alias ? ' -> ' + r.alias : '')}>
    <Icon d={GLYPH[r.kind]} size={10} />
    <span className="git-sr">{refLabel(r)}</span>
    <span className="git-ref-text" aria-hidden="true">{refText(r)}</span>
  </span>;
}

/** Compact row decorations: up to ROW_REF_LIMIT badges and a "+N more" count whose spoken label lists the rest. */
export function RowRefs({ refs }: { refs?: CommitRef[] }) {
  if (!refs?.length) return null;
  const shown = refs.slice(0, ROW_REF_LIMIT), rest = refs.slice(ROW_REF_LIMIT);
  return <span className="git-refs">
    {shown.map(r => <RefBadge key={r.ref} r={r} />)}
    {rest.length > 0 && <span className="git-ref git-ref-more" title={rest.map(r => r.ref).join('\n')}>
      <span className="git-sr">{rest.length} more: {rest.map(refLabel).join('; ')}</span>
      <span aria-hidden="true">+{rest.length}</span>
    </span>}
  </span>;
}

/** Full, wrapping list of every reference for the selected commit, so long names are discoverable by keyboard. */
export function RefList({ refs }: { refs?: CommitRef[] }) {
  if (!refs?.length) return null;
  return <ul className="git-ref-list" aria-label="References">
    {refs.map(r => <li key={r.ref}><RefBadge r={r} /></li>)}
  </ul>;
}
