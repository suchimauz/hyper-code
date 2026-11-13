/** Versioned compact Git review reference persisted on a git_review_comments user event (`event.gitReview`).
 * It carries identities only — never comment bodies, quoted lines or diffs. Details are read live on demand. */
export type ReviewReference = {
  version: 1;
  /** Repository host of the sending Git tab: `local` or an SSH alias. */
  host: string;
  /** Absolute repository directory of the sending Git tab. */
  dir: string;
  /** Number of comments delivered; always equals ids.length. */
  count: number;
  /** Delivered comment UUIDs (lower-case) in send order. */
  ids: string[];
};
