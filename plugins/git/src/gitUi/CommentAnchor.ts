/** A contiguous, one-sided diff range with its captured text; arbitrary ref ranges are unsupported. */
export type CommentAnchor = {
  /** Repository-relative path, validated with gitUi.checkPath before persistence. */
  path: string;
  /** Repository-relative rename source, or null when not renamed. */
  old_path: string | null;
  /** Side of the diff to which the line numbers refer. */
  side: 'old' | 'new';
  /** First anchored line, 1-based. */
  line_start: number;
  /** Last anchored line, inclusive and not less than line_start. */
  line_end: number;
  /** Snapshot of the anchored lines, at most 2048 UTF-8 bytes. */
  line_text: string;
} & (
  | {
      scope: 'commit';
      /** Full hexadecimal commit object ID (40 or 64 characters). */
      commit_hash: string;
      worktree_group: null;
    }
  | {
      scope: 'worktree';
      commit_hash: null;
      worktree_group: 'staged' | 'unstaged' | 'untracked';
    }
);
