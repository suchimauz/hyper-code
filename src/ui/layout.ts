/**
 * Render standalone HTML documents for trusted built-in and plugin pages.
 * Used dynamically by procs.http.toResponse. React owns the application shell;
 * this document retains page-local HTMX, live updates, popup and CSRF transports.
 * @param opts Document content and metadata.
 * @param opts.currentId Optional agent context for page-local RPC.
 * @param opts.title Optional title prefix.
 * @param opts.main Trusted server-rendered page markup.
 * @param opts.headExtra Trusted additional document-head markup.
 * @param opts.lean Omit page-local popup assets. @default false
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Agent context for page-local RPC. */ currentId?: string;
    /** Optional title prefix. */ title?: string;
    /** Trusted server-rendered page markup. */ main: string;
    /** Trusted additional document-head markup. */ headExtra?: string;
    /** Omit page-local popup assets. @default false */ lean?: boolean;
}): Promise<string> {
    const esc = (text: string) => ctx.fns.procs.ui.escape({ text });
    const currentId = opts.currentId ?? session?.req?.headers.get("x-hyper-agent");
    const csrfToken = session?.req ? await ctx.fns.auth.csrfToken({ req: session.req }) : "";
    const favicon = await ctx.fns.ui.faviconUrl({});
    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="csrf-token" content="${esc(csrfToken)}">
<title>${esc(opts.title ? `${opts.title} · hyper-code2` : "hyper-code2")}</title>
<link rel="icon" href="${esc(favicon)}">
<script>(function(){var mode='auto';try{var saved=localStorage.getItem('hyper-theme');if(saved==='light'||saved==='dark')mode=saved}catch(error){console.debug('Theme preference unavailable',error)}var theme=mode==='auto'?(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;document.documentElement.dataset.themeMode=mode;document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme})()</script>
<meta name="htmx-config" content='{"morphIgnore":["data-htmx-powered","open"]}'>
<link rel="stylesheet" href="/ui/vendor/phosphor.css">
<link rel="stylesheet" href="/ui/vendor/medeo.css">
${((ctx.state as any).procs?.styles ?? []).map((style: { href: string }) => `<link rel="stylesheet" href="${esc(style.href)}">`).join("\n")}
<style>
html,body { min-height:100%; margin:0; }
#page-view,#main { min-width:0; }
:where(button,a,input,select,textarea,summary):focus-visible { outline:2px solid var(--color-primary); outline-offset:2px; }
#app-popup { width:min(48rem,calc(100vw - 2rem)); max-height:85dvh; margin:auto; border:1px solid var(--color-ui-border); border-radius:1rem; padding:0; color:var(--color-base-content); background:var(--color-base-100); }
#app-popup::backdrop { background:rgb(0 0 0 / .4); }
#app-popup-body { overflow:auto; padding:1rem; max-height:70dvh; }
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation:none!important; transition:none!important; } }
</style>
${opts.headExtra ?? ""}
<script src="/procs/ui/htmx.js" defer></script>
<script src="/procs/events/client.js" defer></script>
<script src="/ui/control.js" defer></script>
<script src="/ui/rpc.js?v=6" defer></script>
${opts.lean ? "" : '<script src="/ui/popup.js" defer></script>'}
</head><body class="bg-base-100 text-base-content text-sm"${currentId ? ` data-agent-id="${esc(currentId)}"` : ""}>
<section id="page-view"><main id="main" hx-history-elt>${opts.main}</main></section>
${opts.lean ? "" : `<dialog id="app-popup" aria-labelledby="app-popup-title">
<header class="flex items-center gap-3 border-b border-ui-border p-4"><h2 id="app-popup-title" class="flex-1 font-semibold"></h2><button type="button" id="app-popup-close" data-action="close-popup" aria-label="Close">Close</button></header>
<div id="app-popup-body" class="app-popup-body"></div>
<footer data-tool-popup-footer><button type="button" data-tool-popup-close>Close</button></footer>
</dialog>`}
</body></html>`;
}
