/**
 * Compute whole monotonic goal seconds retaining fractional remainder
 *
 * Pure elapsed accounting. A new process clock epoch resets the baseline without charging downtime. Descendant sources must not charge root elapsed time.
 * @param opts.nowMs Current process monotonic timestamp. @minimum 0
 * @param opts.baselineMs Last committed monotonic baseline. @minimum 0
 * @param opts.carryMs Previously uncharged active duration; use only with a last sampled timestamp baseline, never a fractional baseline. @default 0 @minimum 0 @maximum 999.999999999
 * @param opts.restore Reset baseline after clock epoch change; exclude downtime. @default false
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Current process monotonic timestamp. @minimum 0 */
    nowMs: number;
    /** Last committed monotonic baseline. @minimum 0 */
    baselineMs: number;
    /** Reset baseline after clock epoch change; exclude downtime. @default false */
    restore?: boolean;
    /** Uncharged active duration from the goal clock. Pair with last sampled timestamp, not fractional baseline. @default 0 @minimum 0 @maximum 999.999999999 */
    carryMs?: number;
}): Promise<{
    seconds: number;
    baselineMs: number;
}> {
    if (!Number.isFinite(opts.nowMs) || !Number.isFinite(opts.baselineMs) || opts.nowMs < 0 || opts.baselineMs < 0)
        throw new Error('Invalid monotonic clock');
    const carry = opts.carryMs ?? 0;
    if (!Number.isFinite(carry) || carry < 0 || carry >= 1000)
        throw new Error('Invalid fractional carry');
    if (opts.restore)
        return { seconds: 0, baselineMs: opts.nowMs };
    if (opts.nowMs < opts.baselineMs)
        throw new Error('Monotonic clock moved backwards');
    const seconds = Math.floor((opts.nowMs - opts.baselineMs + carry) / 1000);
    return { seconds, baselineMs: opts.baselineMs + seconds * 1000 - carry };
}
