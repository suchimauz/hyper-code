/**
 * Render standalone HTML documents for trusted built-in and plugin pages.
 * Used dynamically by procs.http.toResponse. React owns the application shell;
 * this document retains page-local HTMX, live updates, and CSRF transports.
 * @param opts Document content and metadata.
 * @param opts.currentId Optional agent context for page-local documents.
 * @param opts.title Optional title prefix.
 * @param opts.main Trusted server-rendered page markup.
 * @param opts.headExtra Trusted additional document-head markup.
 * @param opts.lean Reserved compatibility option; documents always omit retired popup assets. @default false
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Agent context for page-local documents. */ currentId?: string;
    /** Optional title prefix. */ title?: string;
    /** Trusted server-rendered page markup. */ main: string;
    /** Trusted additional document-head markup. */ headExtra?: string;
    /** Reserved compatibility option; documents always omit retired popup assets. @default false */ lean?: boolean;
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
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation:none!important; transition:none!important; } }
</style>
${opts.headExtra ?? ""}
<script src="/procs/ui/htmx.js" defer></script>
<script src="/procs/events/client.js" defer></script>
<script src="/ui/control.js" defer></script>
</head><body class="bg-base-100 text-base-content text-sm"${currentId ? ` data-agent-id="${esc(currentId)}"` : ""}>
<section id="page-view"><main id="main" hx-history-elt>${opts.main}</main></section>

</body></html>`;
}
