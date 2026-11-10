// `$input_<kind>.ts` declares a chat form. Later roots may replace a kind only
// when they belong to the same mounted owner; module paths are not identities.

/**
 * Registers input kinds with mounted-source ownership checks before importing them.
 * Built-in kinds stay core-owned; other owners register only their own name prefix.
 * @param opts.entries Classified source entries; metadata-free hot reloads must match a trusted boot entry.
 */
export default async function (ctx: Context, _session: Session | null, opts: { entries: any[] }): Promise<void> {
    const { resolve, relative, isAbsolute } = await import("node:path");
    const state = ((ctx.state as any).input ??= {}) as types.input.State;
    const kinds = (state.kinds ??= {});
    const boot = ctx.state.procs.boot.entries ?? [];
    const mounted = ctx.fns.procs.modules.list({});
    const within = (base: string, path: string) => {
        const rel = relative(resolve(base), resolve(path));
        return rel === "" || (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel));
    };
    const ownerOf = (entry: any): string => {
        const source = entry.root && entry.rootDir ? entry : boot.find(e =>
            e.kind === "input" && e.abs === entry.abs && e.name === entry.name);
        if (!source || typeof source.root !== "string" || typeof source.rootDir !== "string" || typeof source.abs !== "string" ||
            !within(source.rootDir, source.abs) || !mounted.some(m => m.name === source.root && within(m.dir, source.rootDir))) {
            throw new Error(`${entry.rel}: input kind requires a mounted source owner`);
        }
        return source.root;
    };
    const protectedOwners: Record<string, string> = {
        secret: "core", choice: "core", confirm: "core", grid: "core", batch: "core", "planning-review": "core",
    };
    for (const entry of opts.entries) {
        const name = String(entry.name ?? "").toLowerCase();
        if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`${entry.rel}: $input_ name must be a lower-case kind such as choice`);
        const owner = ownerOf(entry);
        const reserved = Object.hasOwn(protectedOwners, name) ? protectedOwners[name] : undefined;
        if (reserved && reserved !== owner) throw new Error(`${entry.rel}: input kind ${name} belongs to ${reserved}, not ${owner}`);
        if (owner !== "core" && !name.startsWith(owner + "-")) throw new Error(`${entry.rel}: input kind ${name} must use owner prefix ${owner}-`);
        const previous = Object.hasOwn(kinds, name) ? kinds[name] : undefined;
        if (previous) {
            // Upgrade registrations created before owner metadata existed, but never
            // guess from moduleDir: separate plugins can declare the same namespace.
            const candidates = boot.filter(e => e.kind === "input" && e.name === name && e.rel === previous.rel);
            const owners = new Set(candidates.map(ownerOf));
            const priorOwner = previous.owner ?? (owners.size === 1 ? [...owners][0] : undefined);
            if (priorOwner !== owner) throw new Error(`${entry.rel}: input kind ${name} already belongs to ${priorOwner ?? "an unknown owner"}, not ${owner}`);
        }
        const imported = entry.mod ?? await import(entry.abs + `?t=${Date.now()}`);
        const def = imported?.default;
        if (!def || typeof def.open !== "function" || typeof def.submit !== "function" || typeof def.done !== "function") {
            throw new Error(`${entry.rel}: $input_ file must default-export { open, submit, done }`);
        }
        if (def.batch !== undefined) {
            const codec = def.batch;
            if (def.completionAuthority || name === "batch" || name === "planning-review") throw new Error(`${entry.rel}: protected or nested input cannot provide a batch codec`);
            const required = ["normalizeSpec", "validate", "projectSpec", "projectDraft"];
            if (!codec || typeof codec !== "object" || codec.version !== 1 || Object.keys(codec).some(k => !["version", ...required, "history"].includes(k)) || required.some(k => typeof codec[k] !== "function") || (codec.history !== undefined && typeof codec.history !== "function")) throw new Error(`${entry.rel}: invalid batch codec version or hooks`);
            if ([...required, ...(codec.history ? ["history"] : [])].some(k => ["AsyncFunction", "GeneratorFunction", "AsyncGeneratorFunction"].includes(codec[k].constructor?.name))) throw new Error(`${entry.rel}: batch codec hooks must be synchronous`);
        }
        const hint = typeof imported.hint === "string" ? imported.hint : undefined;
        kinds[name] = { ...def, name, owner, module: entry.moduleDir === "." ? "app" : String(entry.moduleDir), rel: entry.rel, hint };
        ctx.fns.procs.log.debug({ event: "load.input", msg: name, from: entry.rel });
    }
}
