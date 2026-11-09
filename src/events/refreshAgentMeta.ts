/**
 * Emits a section-scoped agent metadata invalidation hint for live subscribers.
 *
 * Preserves the ui.metaSection event contract for metadata mutations; consumers
 * must fetch canonical data through authorized APIs. The retired HTML inspector
 * and its RPC fragment loader are not part of this transport.
 * @param opts.agentId Target agent identifier.
 * @param opts.section Metadata area that changed; "all" invalidates every area.
 * @param opts.reason Human-readable refresh reason, for tracing.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Target agent identifier. */
    agentId: string;
    /** Which panel section changed. @default "all" */
    section?: "persistentGoal" | "compaction" | "goal" | "knowledge" | "automation" | "wake" | "team" | "plan" | "all";
    /** Human-readable refresh reason, for tracing. */
    reason?: string;
}): void {
    const section = opts.section ?? "all";
    ctx.fns.procs.events.emit({ event: { type: "ui.metaSection", agentId: opts.agentId, section, reason: opts.reason ?? "meta" } });
}
