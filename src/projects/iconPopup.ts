/**
 * Open the personal project logo editor with emoji, SVG and reset controls.
 *
 * Uses the existing chat icon popup pattern and sanitization on save. Only visible projects may be edited.
 * @param opts.projectId Visible project identifier.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible project identifier. */
        projectId: string;
    },
): Promise<Response> {
    const esc = (v: unknown) => ctx.fns.procs.ui.escape({ text: v });
        const id = String(opts.projectId ?? "");
        const agent = await ctx.fns.projects.get({projectId:id});
        if (!agent) return new Response("Project not found", { status: 404 });
        const params = (extra: Record<string, unknown>) => esc(JSON.stringify({ projectId: id, ...extra }));
        const colours = ["#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#334155"];
        const swatches = colours.map((c, i) => `<label class="cursor-pointer"><input type="radio" name="background" value="${c}" class="peer sr-only"${i === 0 ? " checked" : ""}><span class="block size-6 rounded-full ring-offset-2 ring-offset-base-100 peer-checked:ring-2 peer-checked:ring-primary" style="background:${c}"></span></label>`).join("");
        const html = `<div class="space-y-4">
      <div class="flex items-center gap-3">${agent.icon ? `<img width="32" height="32" alt="" src="data:image/svg+xml;base64,${Buffer.from(agent.icon).toString("base64")}">` : `<i class="ph ph-folder" aria-hidden="true"></i>`}<div class="text-xs text-faint">Personal logo shown in project navigation.</div></div>
      <form hx-popup="projects.saveIcon" hx-popup-params='${params({})}' class="space-y-2 rounded-xl border border-ui-border p-3">
        <div class="text-xs font-medium text-muted">Emoji or letters</div>
        <div class="flex items-center gap-2"><input name="emoji" maxlength="8" placeholder="🦊" class="w-20 rounded-lg border border-ui-input bg-base-100 px-3 py-2 text-center text-lg"><div class="flex flex-wrap gap-1.5">${swatches}</div></div>
        ${ctx.fns.procs.ui.button({ action: "save-icon-emoji", label: "Use emoji", type: "submit", tone: "primary" })}
      </form>
      <form hx-popup="projects.saveIcon" hx-popup-params='${params({})}' class="space-y-2 rounded-xl border border-ui-border p-3">
        <div class="text-xs font-medium text-muted">SVG</div>
        <textarea name="svg" rows="5" placeholder='&lt;svg viewBox="0 0 32 32"&gt;…&lt;/svg&gt;' class="block w-full rounded-lg border border-ui-input bg-base-100 p-2 font-mono text-3xs">${esc(agent.icon ?? "")}</textarea>
        <div class="text-3xs text-faint">Up to 8 KB. Scripts, links and embedded images are removed.</div>
        ${ctx.fns.procs.ui.button({ action: "save-icon-svg", label: "Use SVG", type: "submit", tone: "primary" })}
      </form>
      ${agent.icon ? `<form hx-popup="projects.saveIcon" hx-popup-params='${params({ reset: true })}'>${ctx.fns.procs.ui.button({ action: "reset-icon", label: "Back to folder icon", type: "submit" })}</form>` : ""}
    </div>`;
        return new Response(ctx.fns.ui.popupContent({ title: `Project logo · ${agent.title || id}`, html }), { headers: { "content-type": "text/html; charset=utf-8" } });
}
