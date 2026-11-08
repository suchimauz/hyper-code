/**
 * Compute signed saturating Codex cumulative token deltas
 *
 * Pure i64 arithmetic for exact normalized cumulative snapshots. Decimal strings preserve precision; final increment alone is clamped nonnegative.
 * @param opts.current Captured cumulative input inclusive of cache, cached input and output decimal i64 counters.
 * @param opts.baseline Last committed cumulative snapshot, never a live reread.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Captured cumulative input inclusive of cache, cached input and output decimal i64 counters. */
    current: {
        input: string;
        cached: string;
        output: string;
    };
    /** Last committed cumulative snapshot, never a live reread. */
    baseline: {
        input: string;
        cached: string;
        output: string;
    };
}): Promise<{
    raw: string;
    increment: string;
}> {
    const lo = -(1n << 63n), hi = (1n << 63n) - 1n;
    const sat = (x: bigint) => x < lo ? lo : x > hi ? hi : x;
    const parse = (s: string) => { if (!/^-?\d+$/.test(s))
        throw new Error('Invalid decimal counter'); const n = BigInt(s); if (n < lo || n > hi)
        throw new Error('Counter outside i64'); return n; };
    const d = (k: 'input' | 'cached' | 'output') => sat(parse(opts.current[k]) - parse(opts.baseline[k]));
    const output = d('output');
    const raw = sat(sat(d('input') - d('cached')) + (output > 0n ? output : 0n));
    return { raw: String(raw), increment: String(raw > 0n ? raw : 0n) };
}
