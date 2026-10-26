/**
 * Save a project logo from its popup and refresh navigation.
 *
 * Handles emoji, sanitized SVG or reset through projects.setIcon; displays escaped validation errors in the editor.
 * @param opts.projectId Visible project identifier.
 * @param opts.emoji Emoji or letters from the logo form.
 * @param opts.background CSS circle colour from the logo form.
 * @param opts.svg SVG markup from the logo form.
 * @param opts.reset Restore folder icon. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible project identifier. */
        projectId: string;
        /** Emoji or letters from the logo form. */
        emoji?: string;
        /** CSS circle colour from the logo form. */
        background?: string;
        /** SVG markup from the logo form. */
        svg?: string;
        /** Restore folder icon. @default false */
        reset?: boolean;
    },
): Promise<Response> {
    const id = String(opts.projectId ?? "");
        try {
            if (opts.reset) await ctx.fns.projects.setIcon({ projectId:id, reset: true });
            else if (String(opts.svg ?? "").trim()) await ctx.fns.projects.setIcon({ projectId:id, svg: String(opts.svg) });
            else if (String(opts.emoji ?? "").trim()) await ctx.fns.projects.setIcon({ projectId:id, emoji: String(opts.emoji), background: opts.background });
            else throw new Error("Type an emoji or paste SVG");
        } catch (error) {
            const esc = (v: unknown) => ctx.fns.procs.ui.escape({ text: v });
            const again = await ctx.fns.projects.iconPopup({ projectId: id });
            const body = (await again.text()).replace('<div class="space-y-4">', `<div class="space-y-4"><div class="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">${esc(error instanceof Error ? error.message : String(error))}</div>`);
            return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
        }
        return new Response("", { status: 200, headers: { "HX-Refresh": "true" } });
}
