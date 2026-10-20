/**
 * Restricts SSH administration to owners or trusted internal calls
 *
 * Use at every SSH credential and transport boundary. HTTP, WebSocket and RPC calls require an owner identity. Null sessions and request-free agent or REPL sessions without an attached user are trusted internal execution; unknown sessions and explicit non-owner users are rejected.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<void> {
    if (!session) return;
    if (session.user?.role === 'owner') return;
    const internal = !session.req && !session.user && (session.kind === 'agent' || session.kind === 'repl');
    if (!internal) throw new Error('Only owners can manage SSH instances');
}
