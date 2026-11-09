/**
 * Builds one mounted plugin's browser UI bundle from its package.json procs.ui entry
 *
 * Use when a plugin's UI files or manifest changed; plugins.uiBuildAll calls it on load, add and reload. Bundles the declared entry with Bun.build as minified ESM. The modules react, react/jsx-runtime, react-dom and the Hyper UI SDK become imports of host shims under /ui-lab/runtime; relative imports must stay inside the entry folder and every other import fails the build. Validates requested grants: page/panel/action ids and Canvas kinds limited to the plugin's own namespaces. Caches by a source fingerprint in ctx.state.plugins.ui. It never approves or executes the bundle.
 * @param opts.name Mounted plugin name whose UI should be built.
 * @param opts.force Rebuild even when the source fingerprint is unchanged.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Mounted plugin name whose UI should be built. */
        name: string;
        /** Rebuild even when the source fingerprint is unchanged. @default false */
        force?: boolean;
    },
): Promise<{ name: string; changed: boolean; build: types.plugins.UiBundle | null }> {
    const fs = await import('node:fs/promises'); const path = await import('node:path');
    const mod = (ctx.fns.procs.modules.list({}) as Array<{ name: string; dir: string; plugin?: boolean; source?: string; namespaces?: string[] }>).find(m => m.plugin && m.name === opts.name);
    const state = ((ctx.state as { plugins?: types.plugins.State }).plugins ??= {}); const builds = (state.ui ??= {});
    if (!mod) { const had = !!builds[opts.name]; delete builds[opts.name]; return { name: opts.name, changed: had, build: null }; }
    const pkg = await Bun.file(path.join(mod.dir, 'package.json')).json().catch(() => null);
    const ui = pkg?.procs?.ui;
    if (!ui) { const had = !!builds[opts.name]; delete builds[opts.name]; return { name: opts.name, changed: had, build: null }; }
    const list = (v: unknown, field: string): string[] => {
        if (v === undefined) return [];
        if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !x || x.length > 100)) throw new Error(`procs.ui.${field} must be an array of strings`);
        return [...new Set(v as string[])];
    };
    const namespaces = mod.namespaces ?? [];
    let entry = 'ui/index.tsx', error: string | null = null;
    let grants: types.plugins.UiGrants = { pages: [], panels: [], actions: [], canvasKinds: [] };
    const applications: Record<string, string> = {};
    try {
        if (typeof ui !== 'object' || Array.isArray(ui)) throw new Error('procs.ui must be an object');
        const unknown = Object.keys(ui).filter(k => !['entry', 'pages', 'panels', 'actions', 'canvasKinds', 'sidebarNavigation', 'applications'].includes(k));
        if (unknown.length) throw new Error('Unknown procs.ui keys: ' + unknown.join(', '));
        entry = ui.entry ?? entry;
        if (typeof entry !== 'string' || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.(?:tsx|ts|jsx|js)$/.test(entry) || entry.split('/').includes('..')) throw new Error('procs.ui.entry must be a safe plugin-relative script path');
        grants = { pages: list(ui.pages, 'pages'), panels: list(ui.panels, 'panels'), actions: list(ui.actions, 'actions'), canvasKinds: list(ui.canvasKinds, 'canvasKinds'), ...(ui.sidebarNavigation === undefined ? {} : { sidebarNavigation: list(ui.sidebarNavigation, 'sidebarNavigation') }) };
        for (const id of [...grants.pages, ...grants.panels, ...grants.actions]) if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) throw new Error('Invalid surface id: ' + id);
        for (const id of grants.sidebarNavigation ?? []) if (!grants.pages.includes(id)) throw new Error('procs.ui.sidebarNavigation must reference a requested page: ' + id);
        for (const kind of grants.canvasKinds) if (!namespaces.some(ns => kind.startsWith(ns + '.'))) throw new Error(`Canvas kind ${kind} must start with a namespace of this plugin (${namespaces.join(', ')})`);
        if (ui.applications !== undefined) {
            if (!ui.applications || typeof ui.applications !== 'object' || Array.isArray(ui.applications)) throw new Error('procs.ui.applications must be an object');
            for (const [href, page] of Object.entries(ui.applications)) {
                if (!/^\/[A-Za-z0-9_/-]{0,200}$/.test(href) || typeof page !== 'string' || !grants.pages.includes(page)) throw new Error('procs.ui.applications must map a path to a requested page: ' + href);
                applications[href.replace(/\/$/, '') || '/'] = page;
            }
        }
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
    const root = await fs.realpath(mod.dir); const uiRoot = path.join(root, path.dirname(entry));
    const parts: string[] = [JSON.stringify(ui), String(mod.source)];
    async function walk(dir: string, depth: number): Promise<void> {
        let entries; try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            const p = path.join(dir, e.name);
            if (e.isDirectory() && depth < 8 && e.name !== 'node_modules') await walk(p, depth + 1);
            else if (e.isFile()) { const s = await fs.stat(p); parts.push(`${path.relative(root, p)}:${s.size}:${s.mtimeMs}`); }
        }
    }
    await walk(uiRoot, 0);
    const fingerprint = new Bun.CryptoHasher('sha256').update(parts.join('\n')).digest('hex');
    const previous = builds[opts.name];
    if (!opts.force && previous && previous.fingerprint === fingerprint) return { name: opts.name, changed: false, build: previous };
    let code: string | null = null, hash: string | null = null;
    if (!error) try {
        const entryPath = path.join(root, entry);
        if (!(await fs.realpath(entryPath)).startsWith(uiRoot + path.sep)) throw new Error('UI entry escapes the plugin directory');
        const shims: Record<string, string> = {
            'react': '/plugins/ui/runtime/react.js', 'react/jsx-runtime': '/plugins/ui/runtime/react-jsx-runtime.js',
            'react-dom': '/plugins/ui/runtime/react-dom.js', '@hyper/ui': '/plugins/ui/runtime/hyper-ui.js',
        };
        const result = await Bun.build({
            entrypoints: [entryPath], target: 'browser', format: 'esm', minify: true, splitting: false,
            define: { 'process.env.NODE_ENV': '"production"' }, throw: false,
            plugins: [{ name: 'hyper-plugin-ui-boundary', setup(build) {
                build.onResolve({ filter: /.*/ }, args => {
                    if (!args.importer) return undefined;
                    if (Object.hasOwn(shims, args.path)) return { path: shims[args.path]!, external: true };
                    if (args.path.startsWith('./') || args.path.startsWith('../')) {
                        const target = path.resolve(path.dirname(args.importer), args.path);
                        if (target === uiRoot || target.startsWith(uiRoot + path.sep)) return undefined;
                    }
                    throw new Error(`Plugin UI may import only react, react-dom, the Hyper UI SDK and files inside ${path.dirname(entry)}/: ${args.path}`);
                });
            } }],
        } as Parameters<typeof Bun.build>[0] & { throw: false });
        if (!result.success) throw new Error(result.logs.map(String).join('\n').slice(0, 4000) || 'Build failed');
        if (result.outputs.length !== 1) throw new Error('Plugin UI must build to exactly one JavaScript file (no CSS or assets)');
        code = await result.outputs[0]!.text();
        hash = new Bun.CryptoHasher('sha256').update(code).digest('hex').slice(0, 16);
    } catch (e) { error = (e instanceof Error ? e.message : String(e)).slice(0, 4000); }
    const build: types.plugins.UiBundle = { name: opts.name, source: String(mod.source ?? 'user'), namespaces, entry, fingerprint, hash, code, grants, applications, error, builtAt: Date.now() };
    builds[opts.name] = build;
    const changed = !previous || previous.hash !== hash || previous.error !== error || JSON.stringify(previous.grants) !== JSON.stringify(grants) || JSON.stringify(previous.applications) !== JSON.stringify(applications);
    return { name: opts.name, changed, build };
}
