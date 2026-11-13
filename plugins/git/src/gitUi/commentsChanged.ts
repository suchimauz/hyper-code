/**
 * Publish a Git comment invalidation after commit; repository live keys hash the JSON host-directory pair.
 *
 * Publish a Git comment invalidation after commit; repository live keys hash the JSON host-directory pair.
 * @param opts.host Pinned repository host.
 * @param opts.dir Pinned absolute repository directory.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Pinned repository host. */
        host: string;
        /** Pinned absolute repository directory. */
        dir: string;
    },
): Promise<void> {
    const key=new Bun.CryptoHasher('sha256').update(JSON.stringify([opts.host,opts.dir])).digest('hex').slice(0,16);
    ctx.fns.procs.events.emit({event:{type:'gitUi.comments.changed',key}});
}
