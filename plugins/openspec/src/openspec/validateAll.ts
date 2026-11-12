/**
 * Runs strict OpenSpec validation of every change and spec in a local workspace and returns a normalized result.
 *
 * Calls `openspec.run` with `validate --all --strict --json --no-interactive` (60 s timeout) for the read-only
 * OpenSpec Canvas tab. Validation writes no files. `ok` is true only when the CLI succeeded and every item is valid;
 * each item carries its reported issue messages. A CLI failure without JSON output yields `ok: false` with `error`.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Absolute local workspace directory whose `.mauzcode/openspec` folder is validated. */
    dir: string;
}): Promise<{
    ok: boolean;
    items: { id: string; type: string; valid: boolean; issues: { level: string; path: string; message: string }[] }[];
    error?: string;
}> {
    const r = await ctx.fns.openspec.run({ dir: opts.dir, args: ['validate', '--all', '--strict', '--json', '--no-interactive'], timeoutMs: 60000 });
    let parsed: { items?: unknown } | null = null;
    try { const start = r.stdout.indexOf('{'); parsed = start >= 0 ? JSON.parse(r.stdout.slice(start)) : null; } catch { parsed = null; }
    if (!parsed || !Array.isArray(parsed.items)) {
        const error = (r.stderr || r.stdout).trim().slice(0, 2000) || 'Validation produced no result (exit ' + r.exitCode + ')';
        return { ok: false, items: [], error };
    }
    const items = (parsed.items as Record<string, unknown>[]).map(i => ({
        id: String(i.id ?? ''),
        type: String(i.type ?? ''),
        valid: i.valid === true,
        issues: (Array.isArray(i.issues) ? i.issues as Record<string, unknown>[] : []).map(x => ({
            level: String(x.level ?? 'ERROR'),
            path: String(x.path ?? ''),
            message: String(x.message ?? ''),
        })),
    }));
    return { ok: r.ok && items.every(i => i.valid), items };
}
