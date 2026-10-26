/**
 * Set or reset the current viewer’s project logo with sanitized SVG or emoji.
 *
 * Use for a visible project. Stores the personal logo on the authorized project membership; accepts exactly one SVG, emoji, or reset. SVG uses the same sanitizer and size limit as chat icons.
 * @param opts.projectId Visible project identifier.
 * @param opts.svg SVG markup to sanitize, at most 8 KB.
 * @param opts.emoji Emoji or up to two letters on a circle.
 * @param opts.background CSS circle colour. @default #334155
 * @param opts.reset Restore the folder icon. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible project identifier. */
        projectId: string;
        /** SVG markup to sanitize, at most 8 KB. */
        svg?: string;
        /** Emoji or up to two letters on a circle. */
        emoji?: string;
        /** CSS circle colour. @default #334155 */
        background?: string;
        /** Restore the folder icon. @default false */
        reset?: boolean;
    },
): Promise<{id:string;icon:string|null}> {
    const project = await ctx.fns.projects.get({projectId:opts.projectId});
    if (!project) throw new Error('Project not found');
    const sources = [opts.svg, opts.emoji, opts.reset ? true : undefined].filter(v => v !== undefined && v !== '');
    if (sources.length !== 1) throw new Error('Pass exactly one of svg, emoji or reset');
        let icon: string | null = null;
        if (opts.svg) icon = ctx.fns.chat.sanitizeSvg({ svg: opts.svg });
        else if (opts.emoji) {
            const text = [...String(opts.emoji).trim()].slice(0, 2).join("");
            const bg = String(opts.background ?? "#334155").trim();
            if (!/^(#[0-9a-f]{3,8}|[a-z]{3,20}|(rgb|hsl)a?\([\d\s.,%]+\))$/i.test(bg)) throw new Error("projects.setIcon: background must be a CSS colour such as #7c3aed");
            const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const letters = /^[\p{L}\p{N}]+$/u.test(text);
            icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="${esc(bg)}"/><text x="16" y="16" dy=".35em" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-weight="600" font-size="${letters ? (text.length > 1 ? 13 : 16) : 18}" fill="#fff">${esc(text)}</text></svg>`;
        }

    await ctx.fns.projects.materialize({projectId:project.id});
    const principal=await ctx.fns.projects.principal({});
    await ctx.fns.procs.db.run({sql:'UPDATE project_members SET icon=? WHERE project_id=? AND principal=?',params:[icon,project.id,principal]});
    return {id:project.id,icon};
}
