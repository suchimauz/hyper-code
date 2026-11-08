// `<module>/$script_<name>.js|css` — a browser asset, bundled on request and
// served at the same path its name spells.

/**
 * Load loader script declarations into the runtime.
 * @param opts.entries The loader entries to register.
 */
export default async function (ctx: Context, _session: Session | null, opts: { entries: any[] }): Promise<void> {
    const routes = (ctx.state.procs.http.routes ??= {});
    for (const entry of opts.entries) {
        (routes[entry.routePath] ??= {}).GET = async (_rctx: Context, _session: Session | null, req?: { req?: Request }) => {
            const built = await buildScript(entry.abs, entry.fileName, ctx.fns.procs.project.runtimeDir({}));
            // Revalidation stays (max-age=0), but an unchanged bundle answers 304 instead of the whole file.
            const file = Bun.file(built);
            // Content hash: the bundle is rewritten on every request, so its mtime always changes.
            const etag = `"${Bun.hash(await file.arrayBuffer()).toString(36)}"`;
            const headers = { "content-type": contentTypeFor(entry.routePath), "cache-control": "public, max-age=0, must-revalidate", etag };
            if (req?.req?.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
            return new Response(file, { headers });
        };
        ctx.fns.procs.log.debug({ event: "load.script", msg: entry.routePath, from: `${entry.root}/${entry.rel}` });
    }
}

// Bundling helpers, private to this loader — a file here is one function with a
// default export, so a two-export helper module has no business being one.
async function buildScript(abs: string, fileName: string, runtimeDir: string): Promise<string> {
    const ext = fileName.endsWith(".css") ? ".css" : ".js";
    const key = abs.replace(/[^a-zA-Z0-9]+/g, "_");
    const outdir = `${runtimeDir}/scripts`;
    await Bun.write(outdir + "/.keep", "");
    const out = await Bun.build({
        entrypoints: [abs], outdir, naming: key + ext,
        target: "browser", format: ext === ".css" ? "esm" : "iife", minify: true, sourcemap: "none",
    });
    if (!out.success) throw new Error(out.logs.map(log => log.message).join("\n") || "bundle failed");
    const first = out.outputs[0];
    if (!first) throw new Error("bundle produced no outputs");
    return first.path;
}

function contentTypeFor(path: string): string {
    return path.endsWith(".css") ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8";
}
