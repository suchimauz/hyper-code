/**
 * Prefix a local legacy navigation URL without changing external links or shared resources.
 *
 * Use when rewriting legacy page links and redirect headers for the /old-ui adapter. Absolute same-origin URLs are accepted only when an origin is supplied.
 * @param opts.url Navigation URL from HTML or a response header.
 * @param opts.origin Canonical request origin for recognizing absolute local URLs.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Navigation URL from HTML or a response header. */
        url: string;
        /** Canonical request origin for recognizing absolute local URLs. */
        origin?: string;
    },
): string {
    const value = opts.url;
    if (!value || value === 'true' || value === 'false' || value.startsWith('//') || value.includes('\\')) return value;
    let local = value;
    if (opts.origin && /^https?:/.test(value)) { const u = new URL(value); if (u.origin !== opts.origin) return value; local = u.pathname + u.search + u.hash; }
    if (!local.startsWith('/') || /^\/old-ui(?:[/?#]|$)/.test(local)) return value;
    if (/^\/(?:api|external|node|procs|auth)(?:[/?#]|$)/.test(local) || /\.(?:js|css|woff2?|png|svg|ico)(?:[?#]|$)/.test(local)) return value;
    return '/old-ui' + local;
}
