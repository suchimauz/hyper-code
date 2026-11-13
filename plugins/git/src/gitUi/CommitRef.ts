/**
 * One structured reference decoration attached to a commit shown in Git Canvas History.
 *
 * Built from full ref names (never by splitting `git log --decorate` text), so kinds stay distinct even when short names collide.
 */
export type CommitRef = {
  /** Reference kind: HEAD, local branch, remote-tracking branch or tag. */
  kind: 'head' | 'branch' | 'remote' | 'tag';
  /** Display name: `HEAD`, or the ref name without `refs/heads/`, `refs/remotes/` or `refs/tags/`. */
  name: string;
  /** Full unambiguous reference name, such as `refs/tags/v1` or `HEAD`. */
  ref: string;
  /** For symbolic HEAD: the checked-out branch short name; absent when HEAD is detached. */
  branch?: string;
  /** True for HEAD that does not point to a branch. */
  detached?: boolean;
  /** True when HEAD points to this local branch. */
  current?: boolean;
  /** For a symbolic remote alias such as `origin/HEAD`: the remote-tracking short name it points to. */
  alias?: string;
  /** True for an annotated tag peeled to this commit, false for a lightweight tag. */
  annotated?: boolean;
};
