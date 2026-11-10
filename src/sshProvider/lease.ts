/**
 * Coordinate provider account requests with activation, removal and recovery through response completion
 *
 * Reload-stable reader/writer lease per account slot. Inference requests take `shared` leases and run in parallel; activation, removal, recovery and credential import take `exclusive` leases that wait for every running request and block new ones until released. Waiters are granted in FIFO order, so a queued exclusive lease is not starved by later shared ones. Queued waiters can be cancelled through the signal. Release is idempotent.
 * @param opts.key Owner-bound encrypted account slot identity.
 * @param opts.mode `shared` for provider requests that may run concurrently, `exclusive` for account mutations. @default "exclusive"
 * @param opts.signal Optional cancellation while queued.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owner-bound encrypted account slot identity. */
        key: string;
        /** `shared` for provider requests that may run concurrently, `exclusive` for account mutations. @default "exclusive" */
        mode?: 'shared' | 'exclusive';
        /** Optional cancellation while queued. */
        signal?: AbortSignal;
    },
): Promise<() => void> {
    type Waiter = { mode: 'shared' | 'exclusive'; grant: () => void };
    type Lock = { readers: number; writer: boolean; queue: Waiter[] };
    const state = ctx.state as typeof ctx.state & { sshProviderLocks?: Map<string, Lock>; sshProviderTails?: Map<string, Promise<void>> };
    const locks = state.sshProviderLocks ??= new Map();
    const mode = opts.mode ?? 'exclusive';
    if (mode !== 'shared' && mode !== 'exclusive') throw Error('Invalid lease mode');
    opts.signal?.throwIfAborted();
    // Holders taken through the previous serial lease implementation keep their
    // tail promise until EOF; after a hot reload every new holder waits them out.
    const legacy = state.sshProviderTails?.get(opts.key);

    let lock = locks.get(opts.key);
    if (!lock) { lock = { readers: 0, writer: false, queue: [] }; locks.set(opts.key, lock); }
    const l = lock;
    const pump = () => {
        while (l.queue.length && !l.writer) {
            const head = l.queue[0]!;
            if (head.mode === 'exclusive') {
                if (l.readers > 0) break;
                l.queue.shift(); l.writer = true; head.grant();
                break;
            }
            l.queue.shift(); l.readers++; head.grant();
        }
        if (!l.readers && !l.writer && !l.queue.length && locks.get(opts.key) === l) locks.delete(opts.key);
    };

    let granted = false;
    let resolveGrant!: () => void;
    const grantedP = new Promise<void>(r => (resolveGrant = r));
    const waiter: Waiter = { mode, grant: () => { granted = true; resolveGrant(); } };
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        if (mode === 'shared') l.readers--; else l.writer = false;
        pump();
    };

    l.queue.push(waiter);
    pump();
    let abort = () => {};
    try {
        await Promise.race([
            grantedP.then(() => legacy),
            new Promise<never>((_, reject) => {
                abort = () => reject(Error('Queued request aborted'));
                opts.signal?.addEventListener('abort', abort, { once: true });
                if (opts.signal?.aborted) abort();
            }),
        ]);
    } catch (e) {
        if (granted) release();
        else { const i = l.queue.indexOf(waiter); if (i >= 0) l.queue.splice(i, 1); pump(); }
        throw e;
    } finally {
        opts.signal?.removeEventListener('abort', abort);
    }
    if (opts.signal?.aborted) { release(); opts.signal.throwIfAborted(); }
    return release;
}
