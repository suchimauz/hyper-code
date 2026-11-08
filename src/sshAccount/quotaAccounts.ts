/**
 * Reads secret-free SSH account identities for shared model and quota displays
 *
 * Use for quota and model discovery available to all users, instead of the owner-only administrative registry. Returns an explicit metadata projection, never credentials, and never reconciles or persists authorization state.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<Array<{ instance: string; provider: "codex" | "claude-code" | "kimi-coding"; account: string; status: "pending" | "connected" | "failed"; updatedAt: number }>> {
    const rows = await ctx.fns.procs.db.select({sql: "SELECT value FROM settings WHERE module = ? AND scope_type = ?", params: ["sshAccount", "global"]});
    const out: Array<{ instance: string; provider: "codex" | "claude-code" | "kimi-coding"; account: string; status: "pending" | "connected" | "failed"; updatedAt: number }> = [];
    for (const row of rows) {
        const value = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        if (!value || typeof value.instance !== "string" || typeof value.account !== "string" || !["codex", "claude-code", "kimi-coding"].includes(value.provider) || !["pending", "connected", "failed"].includes(value.status)) continue;
        out.push({ instance: value.instance, provider: value.provider, account: value.account, status: value.status, updatedAt: Number(value.updatedAt) || 0 });
    }
    return out;
}
