/**
 * Serve the isolated native React sign-in document
 *
 * Use only after login/setup availability guards. Returns a public document loading a fixed auth-only bundle, never the authenticated application shell.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<Response> {
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MauzCode sign-in</title><link rel="stylesheet" href="/auth/ui.css"></head><body><div id="root"></div><script type="module" src="/auth/ui.js"></script></body></html>`, {headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
