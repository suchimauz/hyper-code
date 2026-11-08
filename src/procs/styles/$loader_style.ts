// `<module>/$style_<name>.css` — a Tailwind input, compiled against the whole
// scan, cached, and served at the path its name spells. The framework's own
// stylesheet leads and a module's cascades over it, so the order is the layout's.
/**
 * Load loader style declarations into the runtime.
 * @param opts.entries The loader entries to register.
 */
export default async function (ctx: Context, _session: Session | null, opts: { entries: any[] }): Promise<void> {
    const routes = (ctx.state.procs.http.routes ??= {});
    const styles = (ctx.state.procs.styles ??= []);
    for (const entry of opts.entries) {
        const style = { href: entry.routePath, abs: entry.abs, key: entry.abs.replace(/[^a-zA-Z0-9]+/g, "_") };
        (routes[style.href] ??= {}).GET = async (rctx: Context, _session: Session | null, req?: { req?: Request }) => {
            // `build` decides what is cached — it keys on the wrapper it
            // generates, which names every mounted module, so a module added
            // since the last build is compiled in. Guessing a path here instead
            // is how a leftover file from an older layout shadowed every build
            // that came after it.
            const path = await rctx.fns.procs.styles.build(style);
            // no-cache, not no-store: the browser keeps the sheet and revalidates; an unchanged build answers 304.
            const file = Bun.file(path);
            const etag = `"${file.size.toString(36)}-${file.lastModified.toString(36)}"`;
            const headers = { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache", etag };
            if (req?.req?.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
            return new Response(file, { headers });
        };
        styles.push(style);
        ctx.fns.procs.log.debug({ event: "load.style", msg: style.href, from: `${entry.root}/${entry.rel}` });
    }
    const framework = (s: any) => Number(s.href.startsWith("/procs/styles/"));
    styles.sort((a: any, b: any) => framework(b) - framework(a));
}
