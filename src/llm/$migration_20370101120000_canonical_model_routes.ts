/** Rewrite stored model identifiers to the canonical `[ssh/<host>:]<provider>/<account>:<model>` route. */
export default {
    async up(ctx: Context) {
        const canon = (model: string) => { try { return ctx.fns.llm.parseModelRoute({ model }).route; } catch { return model; } };
        const agents = await ctx.fns.procs.db.select({ sql: "SELECT DISTINCT model FROM agents WHERE model IS NOT NULL AND model <> ''", params: [] }) as Array<{ model: string }>;
        for (const { model } of agents) {
            const route = canon(model);
            if (route !== model) await ctx.fns.procs.db.run({ sql: "UPDATE agents SET model = ? WHERE model = ?", params: [route, model] });
        }
        for (const live of Object.values((ctx.state as any)?.agent ?? {}) as Array<{ model?: string }>) if (live?.model) live.model = canon(live.model);
        const last = await ctx.fns.procs.db.select({ sql: "SELECT value FROM kv WHERE key = 'last-model'", params: [] }) as Array<{ value: string }>;
        if (last[0]?.value) await ctx.fns.procs.db.run({ sql: "UPDATE kv SET value = ? WHERE key = 'last-model'", params: [canon(String(last[0].value))] });
        const prefix = "llm:model-disabled:";
        const disabled = await ctx.fns.procs.db.select({ sql: "SELECT key, value FROM kv WHERE key LIKE ?", params: [prefix + "%"] }) as Array<{ key: string; value: string }>;
        for (const row of disabled) {
            const key = prefix + encodeURIComponent(canon(decodeURIComponent(row.key.slice(prefix.length))));
            if (key === row.key) continue;
            await ctx.fns.procs.db.run({ sql: "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", params: [key, row.value] });
            await ctx.fns.procs.db.run({ sql: "DELETE FROM kv WHERE key = ?", params: [row.key] });
        }
        const settings = await ctx.fns.procs.db.select({ sql: "SELECT scope_type, scope_id, key, value FROM settings WHERE module = 'llm' AND key IN ('defaultModel', 'fallbackModels')", params: [] }) as Array<{ scope_type: string; scope_id: string; key: string; value: string }>;
        for (const row of settings) {
            let value: unknown;
            try { value = JSON.parse(row.value); } catch { continue; }
            if (typeof value !== "string" || !value.trim()) continue;
            const next = value.split(",").map(item => item.trim()).filter(Boolean).map(canon).join(",");
            if (next !== value) await ctx.fns.procs.db.run({ sql: "UPDATE settings SET value = ? WHERE module = 'llm' AND scope_type = ? AND scope_id = ? AND key = ?", params: [JSON.stringify(next), row.scope_type, row.scope_id, row.key] });
        }
    },
};
