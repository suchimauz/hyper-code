/**
 * Return this server process's stable agent-run owner identifier.
 *
 * Returns a random UUID created lazily once per process context and kept across hot reloads. Run claims record it in agents.run_owner so a process that acquires the worker lock can recognise runs left by a dead previous holder. Use whenever code claims an agent run.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): string {
    return ((ctx.state as any).agentInstanceId ??= crypto.randomUUID()) as string;
}
