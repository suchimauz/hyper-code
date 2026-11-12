/** Refreshes cached model lists of all model connections every hour. Never blocks startup. */
export default async function (ctx: Context, _session: Session | null, _opts?: {}) {
    if (ctx.env.MODELS_REFRESH === "off") return {};
    const refresh = () => ctx.fns.models.refreshAll({}).then(r => {
        if (r.failed.length) ctx.fns.procs.log.warn({ event: "models.refreshAll", msg: `${r.refreshed} refreshed, ${r.failed.length} failed` });
    }).catch((e: any) => ctx.fns.procs.log.warn({ event: "models.refreshAll.failed", msg: String(e?.message ?? e) }));
    const refreshTimer = setInterval(refresh, 60 * 60 * 1000);
    return { refreshTimer };
}
