/**
 * Serialize Codex account operations until their response leases finish
 *
 * Internal account gate for dispatch, import and rollback. A FIFO exclusive lease blocks newly queued requests and drains earlier streams. State survives hot reload in the runtime context; callers must always release in finally or on response EOF/cancel.
 * @param opts.instance Configured SSH instance name.
 * @param opts.account Isolated Codex account slot.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Configured SSH instance name. */
        instance: string;
        /** Isolated Codex account slot. */
        account: string;
    },
): Promise<() => void> {
    await ctx.fns.sshAccount.requireOwner({});
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(opts.instance) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(opts.account)) throw new Error('Invalid Codex account');
    const state = ((ctx.state as any).codexAccount ??= {});
    const gates: Map<string, Promise<void>> = (state.gates ??= new Map());
    const key = JSON.stringify([opts.instance, opts.account]);
    const previous = gates.get(key) ?? Promise.resolve();
    let unlock!: () => void;
    const held = new Promise<void>(resolve => { unlock = resolve; });
    gates.set(key, held);
    await previous;
    let released = false;
    return () => { if (released) return; released = true; if (gates.get(key) === held) gates.delete(key); unlock(); };
}
