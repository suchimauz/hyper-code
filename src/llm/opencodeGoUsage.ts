/**
 * Fetch the three shared OpenCode Go subscription quota windows
 *
 * Read only the Console V2 Go usage endpoint with the configured key and selected local or pinned SSH transport. Validate all windows before returning normalized used percentages for llm.recordUsage. Percent is used quota, not remaining; monthly duration is nominal and server reset timestamps are authoritative. Failed or unrecognized responses throw rather than imply unused quota. Never falls back to PAYG or performs inference.
 * @param opts.timeoutMs Deadline for the read-only quota request in milliseconds. @default 5000 @minimum 500 @maximum 30000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Deadline for the read-only quota request in milliseconds. @default 5000 @minimum 500 @maximum 30000 */
        timeoutMs?: number;
    },
): Promise<{ primary: { used_percent: number; window_minutes: number; resets_at: number }; secondary: { used_percent: number; window_minutes: number; resets_at: number }; tertiary: { used_percent: number; window_minutes: number; resets_at: number }; planType: string }> {
    const response = await ctx.fns.llm.opencodeFetch({
        url: 'https://opencode.ai/inference/go/v1/usage',
        init: { method: 'GET', headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(Math.min(30000, Math.max(500, opts.timeoutMs ?? 5000))) },
    });
    if (!response.ok) throw new Error('OpenCode Go usage unavailable (HTTP ' + response.status + ')');
    const body = await response.json() as { usage?: Record<string, { percent?: number; status?: string; resetsAt?: string }> };
    const window = (key: string, minutes: number) => {
        const raw = body?.usage?.[key];
        const reset = typeof raw?.resetsAt === 'string' ? Date.parse(raw.resetsAt) : NaN;
        if (!raw || typeof raw.percent !== 'number' || !Number.isFinite(raw.percent) || raw.percent < 0 || raw.percent > 100 || !['ok', 'rate-limited'].includes(raw.status ?? '') || !Number.isFinite(reset) || reset <= 0) throw new Error('Unrecognized OpenCode Go quota window: ' + key);
        return { used_percent: raw.status === 'rate-limited' ? 100 : raw.percent, window_minutes: minutes, resets_at: reset / 1000 };
    };
    return { primary: window('rolling', 300), secondary: window('weekly', 10080), tertiary: window('monthly', 43200), planType: 'Go subscription' };
}
