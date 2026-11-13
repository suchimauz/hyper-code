/**
 * Normalize Postgres bigint timestamps to JSON numbers and attach the computed outdated flag.
 *
 * Normalize Postgres bigint timestamps to JSON numbers and attach the computed outdated flag.
 * @param opts.row Database row to normalize.
 * @param opts.outdated Computed worktree anchor state; defaults to false.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Database row to normalize. */
        row: types.gitUi.ReviewComment;
        /** Computed worktree anchor state; defaults to false. */
        outdated?: boolean;
    },
): Promise<types.gitUi.ReviewComment> {
    return {...opts.row,created_at:Number(opts.row.created_at),updated_at:Number(opts.row.updated_at),sent_at:opts.row.sent_at===null?null:Number(opts.row.sent_at),resolved_at:opts.row.resolved_at===null?null:Number(opts.row.resolved_at),outdated:opts.outdated??false};
}
