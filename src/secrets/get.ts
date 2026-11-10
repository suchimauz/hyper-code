/**
 * Resolve a runtime secret through memory, encrypted local storage, then bootstrap provider
 *
 * Provides the mandatory transparent secret API for runtime and plugin code. Mutable secret:// references always read encrypted Postgres storage without caching plaintext, so committed replacements and transaction rollback remain consistent. Bootstrap references use a memory cache, then local storage, then env://, op:// or a legacy literal provider. Use this instead of calling secrets.resolve or 1Password directly.
 * @param opts.ref Stable env://, op:// or secret://namespace/name reference, or legacy literal.
 * @param opts.namespace Stable local namespace; defaults to the provider inferred from ref.
 * @param opts.name Stable local key; defaults to a SHA-256 digest of ref.
 * @param opts.refresh Bypass local and memory caches and refresh from the bootstrap provider. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Stable env://, op:// or secret://namespace/name reference, or legacy literal. */
        ref: string;
        /** Stable local namespace; defaults to the provider inferred from ref. */
        namespace?: string;
        /** Stable local key; defaults to a SHA-256 digest of ref. */
        name?: string;
        /** Bypass local and memory caches and refresh from the bootstrap provider. @default false */
        refresh?: boolean;
    },
): Promise<string | null> {
    const ref = String(opts.ref ?? "").trim();
        if (!ref) return null;
        // secret://<namespace>/<name> names an entry written by secrets.set or
        // secureInput.prompt({ saveAs }) — local storage only, no bootstrap.
        if (ref.startsWith("secret://")) {
            const parsed = ctx.fns.secrets.parseRef({ ref });
            // Mutable secret:// references must observe the caller's database snapshot.
            // Never publish a transaction-local plaintext to the process-wide cache:
            // the transaction may still roll back, or another process may overwrite it.
            return ctx.fns.secrets.getLocal(parsed);
        }
        const digest = new Bun.CryptoHasher("sha256").update(ref).digest("hex").slice(0, 32);
        const provider = ref.startsWith("op://") ? "op" : ref.startsWith("env://") ? "env" : "literal";
        const namespace = String(opts.namespace ?? `bootstrap:${provider}`).trim();
        const name = String(opts.name ?? digest).trim();
        const root = ((ctx.state as any).secrets ??= {});
        const cache: Map<string,string> = (root.values ??= new Map());
        const cacheKey = `${namespace}/${name}`;
        if (!opts.refresh && cache.has(cacheKey)) return cache.get(cacheKey)!;
        if (!opts.refresh) {
            const local = await ctx.fns.secrets.getLocal({ namespace, name });
            if (local != null) { cache.set(cacheKey, local); return local; }
        }
        const value = await ctx.fns.secrets.resolve({ ref });
        if (value == null) return null;
        await ctx.fns.secrets.putLocal({ namespace, name, value, source: provider + "-bootstrap" });
        cache.set(cacheKey, value);
        return value;
}
