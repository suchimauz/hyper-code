/**
 * Render the shared HTML page shell, assets, popup and secure-input host.
 * Use `?presentation=sidebar` for the same chat surface without global navigation
 * or agent Meta at any viewport width. `?embed=1` keeps iframe-preview behavior
 * and takes precedence over sidebar presentation; ordinary pages are unchanged.
 * @param opts Shell content and optional active-agent and document metadata.
 * @param opts.currentId Active agent ID; defaults to the x-hyper-agent request header.
 * @param opts.title Page title prefix; omitted titles use hyper-code2.
 * @param opts.main Trusted rendered HTML for the main page surface.
 * @param opts.headExtra Trusted additional document-head markup; omitted by default.
 */
export default async function (ctx: Context, session: Session | null, opts: {
        /** Identifier of the currently selected agent. */ currentId?: string;
        /** Page title. */ title?: string;
        /** Rendered main-page HTML. */ main: string;
        /** Additional HTML to include in the document head. */ headExtra?: string }): Promise<string> {
    const esc = (s: any) => ctx.fns.procs.ui.escape({ text: s });

    // currentId only identifies the active agent to browser-side chat behavior.
    const currentId = opts.currentId ?? session?.req?.headers?.get("x-hyper-agent") ?? undefined;
    const pageTitle = opts.title ? `${opts.title} · hyper-code2` : "hyper-code2";
    const embedded = session?.url?.searchParams.get("embed") === "1";
    const sidebar = !embedded && session?.url?.searchParams.get("presentation") === "sidebar";
    const hideNavigation = embedded || sidebar;
    // The instance can carry its own icon (ui.setFavicon); the built-in one otherwise.
    const favicon = await ctx.fns.ui.faviconUrl({});
    const csrfToken = session?.req ? await ctx.fns.auth.csrfToken({ req: session.req }) : "";
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="csrf-token" content="${esc(csrfToken)}">
<meta name="theme-color" content="#ffffff">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<script>(function(){var mode='auto';try{var saved=localStorage.getItem('hyper-theme');if(saved==='light'||saved==='dark')mode=saved}catch(_){}var theme=mode==='auto'?(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;var root=document.documentElement;root.dataset.themeMode=mode;root.dataset.theme=theme;root.style.colorScheme=theme;root.style.backgroundColor=theme==='dark'?'#252a34':'#ffffff';document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#252a34':'#ffffff';document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content=theme==='dark'?'black':'default'})()</script>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title>${esc(pageTitle)}</title>
<link rel="icon" href="${esc(favicon)}">
<link rel="apple-touch-icon" sizes="180x180" href="/ui/app-icon?size=180">
<link rel="manifest" href="/ui/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Hyper">
<!-- htmx 4 (framework bundle). Inheritance stays explicit (htmx 4 default):
     implicit inheritance let hx-trigger="load" leak into child buttons and loop.
     Default 60 s timeout; long actions opt out with hx-config='{"timeout":0}'.
     4xx/5xx HTML is swapped like any answer; non-HTML errors become a toast
     (ui/controlScript).
     morphIgnore "open": a morph keeps the reader's open/closed <details>
     instead of resetting it to whatever the server rendered. -->
<meta name="htmx-config" content='{"morphIgnore":["data-htmx-powered","open"]}'>
<script src="/procs/ui/htmx.js" defer></script>
<link rel="stylesheet" href="/ui/vendor/phosphor.css">
<link rel="stylesheet" href="/ui/vendor/medeo.css">
<style>
/* Consecutive calls form one quiet disclosure; named rows retain lazy details. */
.tool-tray { position: relative; display: flex; flex-direction: column; align-items: stretch; min-width: 0; max-width: 100%; overflow: hidden; margin-block: .75rem; border: 1px solid var(--color-ui-border); border-radius: .75rem; background: var(--color-base-100); }
.tool-tray::-webkit-scrollbar { display: none; }
.inplace-popup-panel[data-chat-panel] { margin-top: .375rem; width: min(25rem, calc(100vw - 1.5rem)); max-height: min(46rem, calc(100dvh - 6rem)); overflow: auto; padding: 0; border-radius: 1.125rem; border-color: var(--color-ui-border); background: var(--color-base-100); box-shadow: 0 16px 48px rgb(0 0 0 / .16); overscroll-behavior: contain; scrollbar-width: none; }
.inplace-popup-panel[data-chat-panel]::-webkit-scrollbar { display: none; }
/* Match the header/composer axis even with non-overlay system scrollbars. */
#chat-panel #messages { scrollbar-gutter: stable both-edges; }
.chat-header { position: absolute; inset: 0 0 auto; z-index: 40; display: flex; align-items: center; gap: .75rem; width: calc(100% - 2rem); max-width: 48rem; min-height: 4.25rem; margin: .75rem auto 0; padding: .5rem .625rem; border: 1px solid var(--color-ui-border); border-radius: 1rem; color: var(--color-base-content); }
.chat-header :is(button,a), [data-chat-panel] :is(button,a,summary) { cursor: pointer; touch-action: manipulation; }
.chat-header :is(button,a):focus-visible, [data-chat-panel] :is(button,a,summary):focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.chat-header :is(button,a), [data-chat-panel] :is(button,a,summary) { transition: background-color 120ms ease, color 120ms ease; }
.chat-header :is(button,a):hover, [data-chat-panel] :is(button,a,summary):hover { background-color: var(--color-base-200); }
.chat-header :is(button,a):active, [data-chat-panel] :is(button,a,summary):active { background-color: var(--color-base-300); }
.chat-header-avatar { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 2.75rem; height: 2.75rem; border-radius: .8rem; background: var(--color-base-100); }
.chat-header-identity { min-width: 0; flex: 1; }
.chat-header-name { display: block; min-width: 0; max-width: 100%; padding: .125rem .25rem; margin-left: -.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: .375rem; text-align: left; font-family: inherit; font-size: .9375rem; font-weight: 600; line-height: 1.35; color: var(--color-base-content); }
.chat-header-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-header-meta { display: flex; align-items: center; gap: .4rem; min-width: 0; margin-top: .125rem; }
.chat-agent-id { display: inline-flex; align-items: center; gap: .3rem; flex: none; font-family: var(--font-mono); font-size: .6875rem; font-weight: 500; line-height: 1.4; letter-spacing: .015em; color: var(--color-muted); white-space: nowrap; }
.chat-agent-id-label { font-size: .5625rem; font-family: inherit; opacity: .8; }
.chat-header-badges { display: flex; align-items: center; gap: .25rem; min-width: 0; overflow: hidden; }
.chat-header-badges [data-chat-id="agent.workspace"] { flex-shrink: 1; }
.chat-header-badges [data-chat-id="agent.workspace"] button { padding-left: 0; }
/* Error recovery is an action, not a clipped informational badge. */
.chat-header-badges:has([data-agent-retry]) { flex: 1; }
.chat-header-badges:has([data-agent-retry]) > .chat-part { flex-shrink: 1; }
.chat-header-badges [data-chat-id="agent.status"]:has([data-agent-retry]) { order: -1; }
.chat-header-badges #status-bar:has([data-agent-retry]) { min-width: 0; }
.chat-header-badges #status-bar:has([data-agent-retry]) > span:first-child { min-width: 0; }
.chat-header-actions, .chat-header [data-chat-buttons] { display: flex; flex: none; align-items: center; gap: .25rem; }
.chat-header .chat-toolbar-button { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: .4rem; min-height: 2.75rem; padding: 0 .625rem; border-radius: .65rem; font-size: .75rem; font-weight: 550; color: var(--color-muted); }
.chat-header .chat-toolbar-button > i { font-size: 1.25rem; }
.chat-header .chat-toolbar-more { width: 2.75rem; padding: 0; margin-left: .125rem; border: 1px solid var(--color-ui-border); background: var(--color-base-200); color: var(--color-base-content); box-shadow: none; }
.chat-header .chat-toolbar-more:hover { background: var(--color-base-300); }
.chat-header .chat-toolbar-button:is([aria-pressed="true"],[aria-expanded="true"]), [data-chat-panel] .chat-panel-shortcut[aria-pressed="true"] { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 10%, var(--color-base-100)); }
.chat-panel-loading { margin: 0; padding: 1.25rem; font-size: .8125rem; color: var(--color-muted); }
.chat-panel-title { display: flex; align-items: center; justify-content: space-between; padding: .75rem 1rem 0; font-size: .75rem; font-weight: 600; }
.chat-panel-title button { display: inline-flex; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem; border-radius: .65rem; color: var(--color-muted); font-size: 1.125rem; }
.chat-panel-identity { display: flex; align-items: center; gap: .875rem; padding: .875rem 1.25rem 1.25rem; }
.chat-panel-avatar { display: inline-flex; align-items: center; justify-content: center; position: relative; width: 3.5rem; height: 3.5rem; flex: none; border-radius: 1rem; background: var(--color-base-200); }
.chat-panel-icon-edit { position: absolute; bottom: -.125rem; right: -.125rem; display: grid; place-items: center; width: 1.25rem; height: 1.25rem; border: 1px solid var(--color-ui-border); border-radius: 50%; background: var(--color-base-100); color: var(--color-muted); font-size: .6875rem; }
.chat-panel-identity-text { min-width: 0; }
.chat-panel-name { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: .125rem .25rem; margin-left: -.25rem; border-radius: .375rem; font-size: 1.125rem; line-height: 1.4; font-weight: 650; text-align: left; }
.chat-panel-meta, .chat-panel-tip { margin: .25rem 0 0; color: var(--color-muted); font-size: .6875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-panel-meta { display: flex; align-items: center; gap: .625rem; }
.chat-panel-meta .chat-agent-id { font-size: .6875rem; }
.chat-panel-project { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.chat-panel-tip { font-size: .625rem; }
[data-chat-panel] .chat-card { min-width: 0; padding: .75rem 1rem; border-top: 1px solid var(--color-ui-border); }
.chat-card-heading { margin: 0 .25rem .5rem; color: var(--color-muted); font-size: .625rem; font-weight: 650; text-transform: uppercase; letter-spacing: .06em; }
.chat-panel-shortcuts { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .5rem; margin-bottom: .5rem; }
.chat-panel-shortcut { display: flex; align-items: center; gap: .625rem; min-width: 0; min-height: 3.75rem; padding: .625rem; border: 1px solid var(--color-ui-border); border-radius: .75rem; background: var(--color-base-200); text-align: left; font-size: .75rem; font-weight: 550; }
.chat-panel-shortcut > i { font-size: 1.25rem; color: var(--color-muted); }
.chat-panel-shortcut small { display: block; margin-top: .125rem; color: var(--color-muted); font-size: .625rem; font-weight: 400; }
[data-chat-panel] .chat-row { display: flex; align-items: center; justify-content: flex-start; gap: .625rem; min-height: 2.75rem; width: 100%; padding: .5rem; border-radius: .625rem; font-size: .8125rem; text-align: left; }
[data-chat-panel] .chat-row > i { font-size: 1.125rem; flex: none; }
[data-chat-panel] .chat-row-hint { margin-left: auto; max-width: 48%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-muted); font-size: .6875rem; }
[data-chat-panel] .chat-card-disclosure { padding: .25rem 1rem; }
.chat-card-disclosure > summary { display: flex; align-items: center; gap: .625rem; list-style: none; min-height: 2.75rem; padding: .5rem; border-radius: .625rem; font-size: .8125rem; }
.chat-card-disclosure > summary::-webkit-details-marker { display: none; }
.chat-card-disclosure > summary > i { color: var(--color-muted); font-size: 1.125rem; }
.chat-card-chevron { margin-left: auto; transition: transform 120ms ease; }
.chat-card-disclosure[open] > summary .chat-card-chevron { transform: rotate(90deg); }
.chat-card-detail { padding: 0 0 .5rem 1.25rem; }
[data-chat-panel] .chat-card-danger { padding-bottom: 1rem; }
[data-chat-panel] .chat-row.text-error:hover { background: color-mix(in srgb, var(--color-error) 9%, var(--color-base-100)); }
body[data-presentation="sidebar"] [data-mobile-inspector-open] { display: none !important; }
@media (prefers-reduced-motion: reduce) { .chat-header *, [data-chat-panel] * { transition: none !important; } }
.chat-icon-ring { position: absolute; inset: -3px; border-radius: 9999px; pointer-events: none; background: conic-gradient(from 0deg, transparent 0 55%, var(--color-primary) 100%); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px)); mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px)); animation: chat-icon-spin 1.1s linear infinite; }
/* The header icon follows the live status region: ring on while it says running. */
.chat-icon-ring--live { display: none; }
.chat-header:has([data-agent-running]) .chat-icon-ring--live { display: block; }
@keyframes chat-icon-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .chat-icon-ring { animation: none; background: var(--color-primary); opacity: .45; } }
.chat-run-ring--live .chat-run-dots { transform-origin: 14px 14px; animation: chat-icon-spin 8s linear infinite; }
@media (prefers-reduced-motion: reduce) { .chat-run-ring--live .chat-run-dots { animation: none; } }

.tool-tray-toggle { position: relative; display: flex; flex: none; align-items: center; gap: .5rem; width: 100%; min-height: 44px; padding: .625rem .875rem; border: 0; background: transparent; text-align: left; font-size: .8125rem; font-weight: 550; font-variant-numeric: tabular-nums; color: var(--color-muted); cursor: pointer; }
.tool-tray-collapse { align-self: center; justify-content: center; width: 32px; height: 32px; min-height: 32px; padding: 0; margin: 2px auto; border-radius: 50%; }
@media (pointer: coarse) { .tool-tray-collapse { width: 44px; height: 44px; min-height: 44px; } }
.tool-tray-collapse[hidden] { display: none; }
.chat-response-retry { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--color-muted); cursor: pointer; }
.chat-response-retry > i { font-size: 18px; }
.chat-response-retry:hover { color: var(--color-base-content); background: var(--color-base-200); }
.chat-response-retry:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.chat-response-retry:disabled { opacity: .5; cursor: wait; }
@media (pointer: coarse) { .chat-response-retry { width: 44px; height: 44px; } }
.tool-tray > .tool.tool-tucked:first-child { border-top: 0; }
.tool-tray-toggle > i { transition: rotate 160ms ease; }
.tool-tray-toggle[aria-expanded="true"] > i { rotate: 90deg; }
.tool-tray-toggle:hover { color: var(--color-base-content); background: var(--color-base-200); }
#messages .tool-tray--folded > .tool.tool-history:not([data-tray-exit]) { display: none; }
.tool.tool-tucked { display: flex; align-items: center; justify-content: flex-start; gap: .625rem; width: 100%; min-width: 0; min-height: 44px; height: auto; padding: .625rem .875rem; border: 0; border-radius: .5rem; background: transparent; box-shadow: none; text-align: left; font-size: .8125rem; line-height: 1.4; cursor: pointer; }
.tool-tray .tool.tool-tucked { border-radius: 0; border-top: 1px solid var(--color-ui-border); }
.tool.tool-tucked > i { flex: none; font-size: 1rem; }
.chat-tool-icon { position: relative; display: inline-flex; align-items: center; justify-content: center; flex: none; width: 1.375rem; height: 1.375rem; }
.chat-tool-label { flex: none; max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; }
.chat-tool-subject { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-muted); font-family: var(--font-mono); font-size: .75rem; }
.chat-tool-state { flex: none; margin-left: auto; font-size: .75rem; }
.tool.tool-tucked:hover { background: var(--color-base-200); }
.tool.tool-tucked:active { background: var(--color-base-300); }
.tool.tool-tucked:focus-visible, .tool-tray-toggle:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -3px; }
#messages #active-tool-call { width: 100%; min-width: 0; }
@media (prefers-reduced-motion: reduce) { .tool-tray-toggle > i { transition: none; } #messages .tool-progress { animation: none !important; } }
#dock,
.glass-panel {
  background-color: rgb(from var(--color-base-100) r g b / .68);
  background-image: linear-gradient(110deg, rgb(255 255 255 / .16), transparent 48%, rgb(255 255 255 / .05));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .22), 0 1px 2px rgb(0 0 0 / .04), 0 8px 24px rgb(0 0 0 / .08);
  backdrop-filter: blur(12px) saturate(115%);
  -webkit-backdrop-filter: blur(12px) saturate(115%);
}
/* The top zone scrolls when pins outgrow it; a soft fade at the bottom edge says there is more. */
#dock-top { scrollbar-width: none; mask-image: linear-gradient(to bottom, black calc(100% - 1.25rem), transparent); padding-bottom: 1rem; }
#dock-top::-webkit-scrollbar { display: none; }
.glass-panel {
  box-shadow: inherit;
}
/* Full-history search keeps the chat mounted underneath. */
.chat-search-dialog { box-sizing:border-box; width:min(960px,96vw); height:min(900px,94dvh); max-width:100vw; max-height:100dvh; border:1px solid #7775; border-radius:14px; padding:16px; color:inherit; background:var(--color-base-100,#fff); overscroll-behavior:contain; }
.chat-search-dialog[open] { display:flex; flex-direction:column; gap:10px; }
.chat-search-dialog::backdrop { background:#0008; }
.chat-search-dialog header,.chat-search-dialog form,.chat-search-dialog nav { display:flex; gap:10px; align-items:center; flex-shrink:0; }
.chat-search-dialog header h2 { flex:1; font-weight:600; font-size:1.0625rem; }
.chat-search-dialog :is(button,input):focus-visible { outline:2px solid var(--color-base-content); outline-offset:2px; }
.chat-search-dialog button { padding:8px 12px; border:1px solid #8885; border-radius:8px; min-height:44px; }
.chat-search-dialog button:disabled { opacity:.45; }
.chat-search-dialog input { flex:1; min-width:0; padding:10px; border:1px solid #8887; border-radius:8px; background:transparent; font-size:16px; }
.chat-search-status { margin:0; font-size:13px; }
.chat-search-results { overflow:auto; min-height:60px; max-height:32%; flex:1; display:flex; flex-direction:column; gap:6px; }
.chat-search-results button { flex-shrink:0; text-align:left; overflow-wrap:anywhere; white-space:pre-wrap; }
.chat-search-results button[aria-current=true] { outline:2px solid #6495ed; outline-offset:-2px; }
.chat-search-detail { overflow:auto; min-height:100px; flex:2; border-top:1px solid #8885; padding-top:10px; }
.chat-search-detail pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; }
.chat-search-dialog mark { background:#ffe082; color:#151515; }
@media (max-width:700px), (max-width:1023px) and (pointer:coarse) { .chat-search-dialog { position:fixed; inset:var(--chat-viewport-top,0px) 0 auto; width:100vw; height:var(--chat-viewport-height,100dvh); margin:0; border-radius:0; padding:12px; padding-top:max(12px,env(safe-area-inset-top)); padding-bottom:max(12px,env(safe-area-inset-bottom)); padding-left:max(12px,env(safe-area-inset-left)); padding-right:max(12px,env(safe-area-inset-right)); } .chat-search-detail { font-size:1.0625rem; line-height:1.5; } }

/* Load /ui/mobileMessage.js with defer alongside other UI scripts.
   Keep these base rules outside the media query: enhanced DOM survives resize. */
.mobile-code-tools { display: none; }
/* Context menu / hold / Shift+F10; original buttons retain confirmations. */
  #messages .mobile-message-enhanced { position: relative; min-width: 0; }
  #messages .mobile-message-enhanced > * { min-width: 0; }
  #messages [data-action="delete-one"],
  #messages [data-action="delete-from"] { display: none; }
  #messages .mobile-message-enhanced:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; border-radius: .5rem; }
  .mobile-message-sheet { position: fixed; inset: auto; z-index: 10000; margin: 0; width: min(18rem, calc(100vw - 1rem)); max-height: calc(100dvh - 1rem); overflow-y: auto; box-sizing: border-box; padding: .375rem; border: 1px solid var(--color-ui-border); border-radius: .75rem; background: var(--color-base-100); color: var(--color-base-content); box-shadow: 0 8px 30px rgb(0 0 0 / .16); }
  .mobile-message-sheet h2 { display: none; }
  .mobile-message-sheet button { display: flex; align-items: center; gap: .625rem; width: 100%; min-height: 44px; padding: .625rem .75rem; border: 0; border-radius: .5rem; text-align: left; font-size: .875rem; cursor: pointer; }
  .mobile-message-sheet button > i { flex: none; font-size: 1.125rem; }
  .mobile-message-sheet button:disabled { opacity: .6; cursor: wait; }
  .mobile-message-sheet button:hover { background: var(--color-base-200); }
  .mobile-message-sheet button[data-danger] { color: var(--color-error); }
  .mobile-message-sheet [role="status"] { display: block; font-size: .8125rem; color: var(--color-muted); }
  .mobile-message-sheet button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
@media (max-width: 700px), (max-width: 1023px) and (pointer: coarse) {
  #messages .assistant { min-width: 0; max-width: 100%; }
  #messages .assistant .prose { min-width: 0; max-width: 100%; }
  #messages .assistant pre[data-mobile-code] {
    max-width: 100%; min-width: 0; overflow-x: auto; overscroll-behavior-x: contain;
    white-space: pre; -webkit-overflow-scrolling: touch; font-size: .875rem; line-height: 1.5;
  }
  #messages .assistant pre[data-mobile-code] code { white-space: pre; overflow-wrap: normal; word-break: normal; font-size: inherit; line-height: inherit; }
  #messages .assistant pre[data-mobile-collapsed="true"] { max-height: 18rem; overflow-y: auto; }
  .mobile-code-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
  .mobile-code-tools button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--color-ui-border, #ddd); border-radius: 10px; }
  .mobile-message-sheet button { min-height: 48px; }
  .mobile-code-tools { color: var(--color-muted, #777); }
  .mobile-message-sheet button:focus-visible,
  .mobile-code-tools button:focus-visible { outline: 3px solid var(--color-primary, #2563eb); outline-offset: 2px; }
}

/* Desktop keeps the existing compact chips; file size is mobile-only. */
.chat-attachment-thumbnail { flex: none; border-radius: .35rem; cursor: zoom-in; }
.chat-attachment-size { display: none; }
.chat-attachment-remove { flex: none; }
.chat-attachment-preview { position: fixed; inset: 0; margin: auto; padding: 3.5rem .75rem .75rem; min-width: min(18rem, 94vw); min-height: 5rem; box-sizing: border-box; border: 1px solid var(--color-base-300); border-radius: .75rem; background: var(--color-base-100, white); color: var(--color-base-content, black); max-width: min(94vw, 64rem); max-height: 90dvh; }
.chat-attachment-preview::backdrop { background: rgb(0 0 0 / .65); }
.chat-attachment-preview img { display: block; max-width: 100%; max-height: calc(90dvh - 4rem); object-fit: contain; }
.chat-attachment-preview-close { position: absolute; top: .25rem; right: .5rem; min-width: 44px; min-height: 44px; }
.chat-attachment-thumbnail:focus-visible, .chat-attachment-remove:focus-visible, .chat-attachment-preview-close:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
@media (max-width: 700px), (max-width: 1023px) and (pointer: coarse) {
  #chat-panel [data-attachments]:not(.hidden) { display: flex; flex-wrap: nowrap; overflow-x: auto; max-width: 100%; padding-block: .25rem; }
  #chat-panel .chat-attachment-card { flex: 0 0 min(78vw, 16rem); max-width: 16rem; min-width: 0; gap: .5rem; padding: .375rem; }
  #chat-panel .chat-attachment-thumbnail img { width: 44px; height: 44px; }
  #chat-panel .chat-attachment-size { display: block; font-size: .75rem; margin-top: .125rem; }
  #chat-panel .chat-attachment-remove { min-width: 44px; min-height: 44px; font-size: 1.25rem; }
}

.agent-meta-panel { min-height: 0; align-self: stretch; height: 100%; margin: 0; border-radius: 0; box-shadow: none; background: var(--inspector-bg); transition: width .18s ease; }
[data-desktop-inspector-header] { background: var(--inspector-bg); }
[data-mobile-inspector-open], [data-mobile-inspector-header] { display: none; }
.chat-header [data-mobile-inspector-open][data-inspector-ready], [data-chat-panel] [data-mobile-inspector-open][data-inspector-ready] { display: inline-flex; }
.agent-meta-panel.agent-meta-collapsed { width: 2.5rem !important; min-width: 2.5rem; }
.agent-meta-panel.agent-meta-collapsed [data-agent-meta-content],
.agent-meta-panel.agent-meta-collapsed [data-agent-inspector-tabs],
.agent-meta-panel.agent-meta-collapsed [data-agent-meta-label] { display: none; }
.agent-meta-panel.agent-meta-collapsed > header { height: 100%; align-items: flex-start; justify-content: center; border-bottom: 0; padding: .5rem 0; background: transparent !important; }
.agent-meta-panel.agent-meta-collapsed .agent-meta-toggle { color: var(--theme-base-content); }

.glass-bar {
  background-color: rgb(from var(--color-base-100) r g b / .68) !important;
  background-image: linear-gradient(110deg, rgb(255 255 255 / .12), transparent 45%, rgb(255 255 255 / .04));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .22), 0 1px 2px rgb(0 0 0 / .04), 0 8px 24px rgb(0 0 0 / .08);
  backdrop-filter: blur(12px) saturate(115%);
  -webkit-backdrop-filter: blur(12px) saturate(115%);
}
#chat-panel { position: relative; container: chat / inline-size; }
/* Canvas (src/canvas): hidden until the agent page carries data-canvas-open. Then the canvas takes the
 * free space on the left, the chat becomes a --chat-w column on the right and the inspector is forced to
 * its strip (its toggle peeks it open via data-canvas-meta-open without changing the saved state). */
[data-page="agent"] > .canvas-panel, [data-page="agent"] > .canvas-resizer { display: none; }
[data-page="agent"][data-canvas-open] > .canvas-panel { display: flex; }
[data-page="agent"][data-canvas-open] > .canvas-resizer { display: block; flex: 0 0 8px; cursor: col-resize; position: relative; touch-action: none; }
[data-page="agent"][data-canvas-open] > .canvas-resizer::after { content: ""; position: absolute; inset: 30% 3px; border-radius: 2px; background: var(--color-base-300); transition: background .15s; }
[data-page="agent"][data-canvas-open] > .canvas-resizer:hover::after, [data-page="agent"][data-canvas-open] > .canvas-resizer:focus-visible::after, [data-page="agent"].canvas-resizing > .canvas-resizer::after { background: var(--color-primary); }
[data-page="agent"][data-canvas-open] > #chat-panel { flex: 0 0 var(--chat-w, 440px); width: var(--chat-w, 440px); max-width: calc(100% - 400px); }
[data-page="agent"][data-canvas-open]:not([data-canvas-meta-open]) > .agent-meta-panel { width: 2.5rem !important; min-width: 2.5rem; }
[data-page="agent"][data-canvas-open]:not([data-canvas-meta-open]) > .agent-meta-panel [data-agent-inspector-tabs],
[data-page="agent"][data-canvas-open]:not([data-canvas-meta-open]) > .agent-meta-panel [data-agent-meta-content],
[data-page="agent"][data-canvas-open]:not([data-canvas-meta-open]) > .agent-meta-panel [data-agent-meta-label] { display: none; }
[data-page="agent"][data-canvas-open]:not([data-canvas-meta-open]) > .agent-meta-panel > header { height: 100%; align-items: flex-start; justify-content: center; border-bottom: 0; padding: .5rem 0; background: transparent !important; }
[data-page="agent"][data-canvas-open][data-canvas-meta-open] > .agent-meta-panel { position: absolute; right: 0; top: 0; bottom: 0; z-index: 50; width: 20rem !important; }
[data-page="agent"][data-canvas-open] { position: relative; }
[data-page="agent"].canvas-resizing { user-select: none; cursor: col-resize; }
[data-page="agent"].canvas-resizing iframe { pointer-events: none; }
/* Narrow window: the canvas covers the whole page; the chat stays mounted underneath. */
@media (max-width: 1023px) {
  [data-page="agent"][data-canvas-open] > .canvas-panel { position: absolute; inset: 0; z-index: 45; margin: .5rem; }
  [data-page="agent"][data-canvas-open] > .canvas-resizer { display: none; }
  [data-page="agent"][data-canvas-open] > #chat-panel { flex: 1 1 auto; width: auto; max-width: none; }
}
/* Place after existing Canvas rules. Keep mounted; no mobile route or iframe reparenting. */
.canvas-mobile-back, .canvas-mobile-tabs, .canvas-mobile-close-tab { display:none; }
@media (max-width:700px), (max-width:1023px) and (pointer:coarse) {
 [data-page="agent"][data-canvas-open] > .canvas-panel { display:flex; position:fixed; inset:var(--chat-viewport-top,0px) 0 auto; z-index:100; width:100%; height:var(--chat-viewport-height,100dvh); margin:0; border:0; border-radius:0; box-sizing:border-box; background:var(--color-base-100); padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
 [data-page="agent"][data-canvas-open] > .canvas-resizer { display:none; }
 [data-page="agent"][data-canvas-open] > #chat-panel { flex:1 1 0%; width:auto; min-width:0; max-width:none; }
 .canvas-panel > header { height:auto; min-height:52px; gap:4px; padding:4px; align-items:center; }
 .canvas-panel [data-canvas-tabs], .canvas-panel [data-canvas-toggle="close"]:not(.canvas-mobile-back) { display:none; }
 .canvas-mobile-back, .canvas-mobile-close-tab { display:inline-flex; align-items:center; justify-content:center; min-height:44px; min-width:44px; padding:0 8px; flex-shrink:0; }
 .canvas-mobile-tabs { display:block; flex:1; min-width:0; min-height:44px; font-size:16px; padding:0 8px; background:var(--color-base-100); color:inherit; border:1px solid var(--color-ui-border); border-radius:8px; }
 .canvas-panel > header button, .canvas-panel > header summary { min-width:44px; min-height:44px; }
 .canvas-panel [data-canvas-history] > div { max-width:calc(100vw - 16px); }
 .canvas-panel [data-canvas-reopen] { min-height:44px; }
}

/* The chat header adapts to the CHAT column, not the window: with the Meta
 * panel open a 1000px window leaves the chat ~420px, and the full action row
 * (effort, compact, prompt, share, fork, info, archive, delete) spilled out of
 * the glass bar over the Meta panel's toggle. Below 560px the secondary actions
 * fold away (they stay in the agent page / Meta), below 420px the workspace and
 * token count go too, so the title keeps real room. */
@container chat (max-width: 560px) {
  #chat-panel > header { gap: .4rem; padding-right: .75rem; }
  /* Badges other than the status fold away; the panel (⋯) has everything they offered. */
  #chat-panel > header [data-chat-badges] > :not([data-chat-id="agent.status"]) { display: none !important; }
  #chat-panel > header .chat-toolbar-label { display: none; }
  #chat-panel > header .chat-toolbar-button { width: 2.75rem; padding-inline: 0; }
}
@container chat (max-width: 420px) {
  #chat-panel > header [data-chat-badges] > :not([data-chat-id="agent.status"]) { display: none !important; }
}
.dot-grid-surface {
  background-color: var(--color-base-200);
  background-image: radial-gradient(circle, color-mix(in oklab, var(--color-base-content) 9%, transparent) 0 1px, transparent 1.35px);
  background-position: 8px 8px;
  background-size: 16px 16px;
  background-attachment: local;
}

/* Legacy class retained for draft/live transcript hooks, not its old texture. */
#chat-panel #messages { background: var(--color-canvas, var(--color-base-100)); background-image: none; }
#chat-panel { background: var(--color-canvas, var(--color-base-100)); }
#chat-panel > .chat-header { position: relative; inset: auto; flex: none; width: 100%; max-width: none; margin: 0; padding: .625rem 1rem; border: 0; border-bottom: 1px solid var(--color-ui-border); border-radius: 0; background: var(--color-canvas, var(--color-base-100)); box-shadow: none; backdrop-filter: none; }
.chat-dot-grid { padding: 1.5rem 1.25rem !important; }
#messages .chat-message { margin-block: 1rem; min-width: 0; }
#messages .chat-message:first-child { margin-top: 0; }
.chat-dot-grid > * {
  width: 100%;
  max-width: 48rem;
  margin-left: auto !important;
  margin-right: auto !important;
}
.chat-composer {
  position: relative;
  z-index: 20;
  flex: none;
  margin: 0 auto .5rem;
  padding-top: .75rem;
  border-top: 1px solid var(--color-ui-border);
  background: var(--color-canvas, var(--color-base-100));
  pointer-events: none;
}
.chat-composer > * { pointer-events: auto; }
.glass-input {
  min-height: 44px;
  max-height: 208px;
  background-color: var(--color-base-100) !important;
  border: 1px solid var(--color-ui-border);
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.chat-box.glass-input { max-height: none; min-height: 0; }
.chat-box:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 1px var(--color-primary); }
.chat-ring { display: block; width: 18px; height: 18px; border-radius: 9999px; background: conic-gradient(var(--c) var(--p), color-mix(in oklab, var(--color-base-content) 14%, transparent) 0); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); }
.glass-input:hover { border-color: var(--color-muted); }
.glass-input:focus { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.chat-composer kbd { font: inherit; color: color-mix(in oklab, var(--color-base-content) 55%, transparent); }


.chat-glass, .chat-glass-primary { background-image: none; backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: none; }
#messages .assistant.chat-glass { min-width: 0; max-width: 100%; padding: .5rem 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
#messages .assistant > .prose { min-width: 0; max-width: 100%; font-size: .9375rem; line-height: 1.65; overflow-wrap: anywhere; }
#messages .assistant > .prose > p { margin-block: .7em; }
.chat-message-meta { display: flex; align-items: center; gap: .5rem; min-height: 2rem; margin-bottom: .375rem; color: var(--color-muted); font-size: .75rem; line-height: 1.4; }
.chat-message-author { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--color-base-content); }
.chat-glass-primary { background: var(--color-base-200); color: var(--color-base-content); border-color: transparent; }
#messages .chat-glass-primary { color: var(--color-base-content); font-size: .9375rem; line-height: 1.6; border-color: transparent; box-shadow: none; }
#messages .chat-glass-primary > [data-author] { color: var(--color-base-content) !important; }
#messages .chat-glass-primary [data-no-copy] { color: var(--color-muted); }
#messages .chat-glass-primary [data-mention] { color: var(--color-base-content); background: var(--color-base-300); }
#messages .chat-glass-primary a[href^="/attachments/"] { background-color: var(--color-base-300); border-color: var(--color-ui-border); }
#messages .chat-glass-primary > [aria-label^="Gate:"] > span:first-child:not(.text-error) { color: var(--color-muted); border-color: var(--color-muted); }
.chat-stream-dot { animation: chat-stream-pulse 1.2s ease-in-out infinite; }
.chat-stream-dot:nth-child(2) { animation-delay: -.4s; }
.chat-stream-dot:nth-child(3) { animation-delay: -.8s; }
@keyframes chat-stream-pulse { 50% { opacity: .25; } }
@media (prefers-reduced-motion: reduce) { .chat-stream-dot { animation: none; } }

/* Highlighted code inside tool detail dialogs. */
.app-popup-body pre { margin: 0; padding: .75rem 1rem; border-radius: .65rem; background: rgba(0,0,0,.04) !important; white-space: pre-wrap; word-break: break-word; }
.app-popup-body pre + pre { margin-top: .75rem; }
.app-popup-body code { font-size: 12px; line-height: 1.5; }
.app-popup-body .edit-preview pre { border-radius: 0; background: transparent !important; }
.app-popup-body .edit-remove pre { background: transparent !important; }
.app-popup-body .edit-add pre { background: transparent !important; }

/* The extra wrapper is layout-neutral on desktop and without the mobile controller. */
.chat-composer [data-composer-settings] { display: contents; }
.chat-composer [data-composer-settings-toggle] { display: none; }
#chat-panel [data-chat-model-mark], .project-mobile-bar { display: none; }
.chat-composer [data-chat-status] { order: 1; }
.chat-composer [data-dictate] { order: 2; }
.chat-composer [data-composer-submit] { order: 3; }
.chat-composer [data-chat-status]:empty, .chat-composer [data-chat-meters]:empty { display: none; }
/* Chat send/network states; no transcript or canvas mutation. */
[data-chat-network], [data-chat-send-error] { margin: .35rem 0; padding: .5rem .75rem; border-radius: .65rem; font-size: .8rem; line-height: 1.45; color: var(--color-base-content); background: color-mix(in srgb, var(--color-base-content) 6%, transparent); }
[data-chat-network][hidden], [data-chat-send-error][hidden] { display: none; }
[data-chat-retry], [data-chat-cancel-retry] { min-height: 44px; padding: .4rem .65rem; text-decoration: underline; text-underline-offset: .2em; }
[data-chat-retry]:disabled, [data-chat-cancel-retry]:disabled { opacity: .5; }
[data-chat-submitting] :is([data-chat-retry], [data-chat-cancel-retry]) { pointer-events: none; }
.chat-local-message { display: flex; flex-direction: column; align-items: flex-end; min-width: 0; }
[data-local-retry] { min-height: 44px; padding: .4rem .75rem; font-size: .8125rem; color: var(--color-error); text-decoration: underline; text-underline-offset: .2em; }
[data-local-retry][hidden] { display: none; }
[data-local-retry]:disabled { opacity: .5; }
#chat-panel #messages .chat-local-message > .chat-glass-primary { position: relative; max-width: 80%; min-width: 0; padding-right: 2.6rem; border: 1px solid transparent; transition: background-color 180ms ease, border-color 180ms ease; }
#chat-panel #messages .chat-local-message[data-state="pending"] > .chat-glass-primary { background: color-mix(in srgb, var(--color-base-content) 8%, var(--color-base-100)); color: var(--color-base-content); border-width: 1px; border-style: dashed; border-color: color-mix(in srgb, var(--color-base-content) 45%, transparent); box-shadow: none; }
.chat-local-message[data-state="pending"] [data-local-text] { opacity: .68; }
[data-local-progress] { position: absolute; right: .75rem; bottom: .75rem; width: 1rem; height: 1rem; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: chat-icon-spin .8s linear infinite; }
.chat-local-message[data-state="pending"] [data-local-progress] { color: var(--color-primary); }
[data-local-progress][hidden] { display: none; }
.chat-local-message[data-state="failed"] [data-local-progress] { animation: none; border: 0; font-weight: 700; line-height: .7rem; }
@media (prefers-reduced-motion: reduce) { #chat-panel #messages .chat-local-message > .chat-glass-primary { transition: none; } [data-local-progress] { animation: none; } }
[data-chat-submitting] [data-composer-send] { opacity: .65; pointer-events: none; }
[data-chat-submitting] [data-composer-send] > i { display: none; }
[data-chat-submitting] [data-composer-send]::after { content: ''; width: 1rem; height: 1rem; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: chat-icon-spin .8s linear infinite; }
@media (prefers-reduced-motion: reduce) { [data-chat-submitting] [data-composer-send]::after { animation: none; } }

/* LLM Connections: readable provider/account cards without changing desktop layout. */
.llm-connections :is(section, article), .llm-accounts, .llm-node-account { min-width: 0; max-width: 100%; }
.llm-node-quota { overflow-wrap: anywhere; margin-top: .5rem; }
@media (max-width: 700px), (max-width: 1023px) and (pointer: coarse) {
  .llm-connections { width: 100%; min-width: 0; }
  .llm-connections-header, .llm-connections-content { padding: 1rem; }
  .llm-connections-header > div { gap: .75rem; flex-wrap: wrap; }
  .llm-connections-header > div > div:first-child { flex: 1 1 12rem; min-width: 0; }
  .llm-connections-header > div > div:last-child { flex: none; }
  .llm-connections-header h1 { font-size: 1.25rem; line-height: 1.3; }
  .llm-connections-header p { font-size: .875rem; line-height: 1.5; }
  .llm-connections h2 { font-size: 1.0625rem; overflow-wrap: anywhere; }
  .llm-connections [data-entity="llm-account"], .llm-connections [data-entity="llm-login"],
  .llm-connections [data-entity="hyper-node"], .llm-connections [data-entity="hyper-node-client"] { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; padding: .75rem; min-width: 0; }
  .llm-connections [data-role] { min-width: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
  .llm-connections :is([data-role="account"], [data-role="name"]) { width: auto; flex: 1 1 9rem; font-size: .875rem; }
  .llm-connections :is([data-role="prefix"], [data-role="quota"], [data-role="url"], [data-role="accounts"], [data-role="providers"]) { width: 100%; flex: 1 0 100%; font-size: .8125rem; line-height: 1.5; }
  .llm-connections :is([data-role="models"], [data-role="requests"], [data-role="hint"]) { font-size: .8125rem; line-height: 1.5; }
  .llm-connections .llm-account-actions, .llm-connections [data-entity] > span:last-child:not([data-role]) { display: flex; flex-wrap: wrap; width: 100%; gap: .5rem; }
  .llm-connections :is(button, a) { max-width: 100%; white-space: normal; overflow-wrap: anywhere; min-height: 44px; min-width: 44px; }
  .llm-connections :is(button, summary, a):focus-visible { outline: 2px solid var(--color-base-content); outline-offset: 2px; }
  .llm-connections summary { min-height: 44px; display: flex; align-items: center; }
  .llm-connections form { min-width: 0; max-width: 100%; flex-wrap: wrap; }
  .llm-connections :is(input:not([type="hidden"]), select, textarea) { max-width: 100%; min-width: 0; font-size: max(16px, 1rem); min-height: 44px; }
  .llm-connections .llm-account-form input { width: 100%; }
  .llm-connections .llm-account-form, .llm-connections .llm-connection-actions { width: 100%; }
  .llm-connections .llm-connection-card { padding: .875rem; }
  .llm-connections .llm-model-list { display: flex; flex-direction: column; gap: .375rem; }
  .llm-connections .llm-model-list li { width: 100%; overflow-wrap: anywhere; word-break: break-word; font-size: .8125rem; padding: .4rem .5rem; line-height: 1.45; }
  .llm-connections .llm-node-quota { font-size: .875rem; line-height: 1.5; }
  .llm-connections .llm-node-account { padding: .875rem; }
  .llm-connections .llm-node-quota[data-quota-state="unknown"], .llm-connections .llm-node-quota[data-quota-state="stale"] { color: var(--color-muted); }
  .llm-connections .llm-node-quota[data-quota-state="fresh"] { color: var(--color-base-content); }
  .llm-connections .llm-connections-content > section > .grid { grid-template-columns: minmax(0, 1fr); }
}

.mobile-usage-strip { display: none; }
[data-tool-popup-footer] { display: none; }
.mobile-usage-dialog { margin: auto; padding: 0; width: min(42rem, calc(100vw - 2rem)); max-width: none; height: min(48rem, 90dvh); max-height: none; border: 1px solid var(--color-ui-border); border-radius: 1rem; overflow: hidden; color: var(--color-base-content); background: var(--color-base-100); }
.mobile-usage-dialog[open] { display: flex; flex-direction: column; }
.mobile-usage-dialog::backdrop { background: #0006; }
.mobile-usage-dialog > header { display: flex; align-items: center; gap: .5rem; flex: none; padding: .25rem .75rem; border-bottom: 1px solid var(--color-ui-border); }
.mobile-usage-dialog h2 { flex: 1; margin: 0; font-size: 17px; font-weight: 600; line-height: 1.25; }
.mobile-usage-dialog button { min-height: 44px; padding: .25rem .375rem; flex: none; font-size: 14px; color: var(--color-base-content); }
.mobile-usage-dialog button:disabled { opacity: .5; }
.mobile-usage-dialog :is(button, summary):focus-visible, .mobile-usage-strip:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; border-radius: .4rem; }
.mobile-usage-notice { flex: none; margin: 0; padding: .625rem 1rem; color: var(--color-muted); font-size: 13px; line-height: 1.45; border-bottom: 1px solid var(--color-ui-border); }
.mobile-usage-content { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 0 1rem 1rem; }
.mobile-usage-card { display: flex; align-items: flex-start; gap: .875rem; padding: .875rem 0; border-bottom: 1px solid var(--color-ui-border); overflow-wrap: anywhere; }
.mobile-usage-card:last-child { border: 0; }
.mobile-usage-card-icon { flex: none; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; margin-top: .1rem; border-radius: .8rem; background: var(--color-base-200); }
.mobile-usage-dialog .mobile-usage-card-ring.mobile-usage-card-ring { width: 36px; height: 36px; }
.mobile-usage-dialog .mobile-usage-card-ring .mobile-usage-ring-track { width: 36px; height: 36px; inset: 0; }
.mobile-usage-dialog .mobile-usage-card-ring .mobile-usage-logo, .mobile-usage-dialog .mobile-usage-card-ring .mobile-usage-logo > span { width: 20px; height: 20px; }
.mobile-usage-dialog .mobile-usage-card-ring .mobile-usage-logo svg { width: 18px; height: 18px; }
.mobile-usage-dialog .mobile-usage-card-ring .mobile-usage-logo i, .mobile-usage-dialog .mobile-usage-card-ring .mobile-usage-provider-glyph { font-size: 17px; }
.mobile-usage-card-body { min-width: 0; flex: 1; }
.mobile-usage-card h3 { font-size: 15px; font-weight: 600; margin: 0 0 .15rem; }
.mobile-usage-logo { display: inline-flex; flex: none; width: 16px; height: 16px; align-items: center; justify-content: center; }
.mobile-usage-logo svg { width: 16px; height: 16px; }
.mobile-usage-meta { color: var(--color-muted); font-size: 12px; line-height: 1.45; margin: .15rem 0; }
.mobile-usage-meta-plain { font-size: 13px; }
.mobile-usage-tip-row { display: flex; align-items: baseline; gap: .4rem; margin: .2rem 0; font-size: 13px; line-height: 1.45; }
.mobile-usage-tip-dot { flex: none; align-self: center; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.mobile-usage-tip-row[data-tone="neutral"] { color: var(--color-muted); }
.mobile-usage-tip-name { flex: none; min-width: 3rem; font-weight: 500; color: var(--color-base-content); }
.mobile-usage-tip-reset { margin-left: auto; padding-left: .75rem; color: var(--color-muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mobile-usage-note { color: var(--color-error); }
.mobile-usage-card summary { min-height: 36px; padding: .5rem 0 .25rem; cursor: pointer; font-size: 13px; color: var(--color-muted); }
.mobile-usage-card ul { margin: 0; padding: 0; list-style: none; }
.mobile-usage-card li { padding: .25rem 0; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }

/* Agent Inspector: an opaque rail with restrained gray depth, shared with the mobile dialog. */
:where(.agent-meta-panel, .inspector-trigger-popup, [data-agent-meta-content], [data-mobile-inspector-dialog]) {
  /* Reuse the product's soft canvas white, not the pure-white raised-card surface. */
  --inspector-bg: var(--color-canvas);
  --inspector-section-bg: var(--theme-base-200);
  --inspector-detail-bg: var(--theme-base-200);
  --inspector-hover-bg: var(--theme-base-300);
  --inspector-pressed-bg: color-mix(in oklab, var(--theme-base-content) 12%, var(--inspector-bg));
  --inspector-detail-rule: var(--ui-border);
  --inspector-active-text: #0755a4; --inspector-active-bg: #eaf3ff; --inspector-active-border: #c8dff8;
  --inspector-success-text: #22623b; --inspector-success-bg: #e9f6ee; --inspector-success-border: #cce7d5;
  --inspector-waiting-text: #815300; --inspector-waiting-bg: #fff4d9; --inspector-waiting-border: #eedba9;
  --inspector-danger-text: #a52d30; --inspector-danger-bg: #ffeded; --inspector-danger-border: #f3cccc;
  --inspector-neutral-text: #535960; --inspector-neutral-bg: #edf0f3; --inspector-neutral-border: #dce1e6;
}
[data-theme="dark"] :where(.agent-meta-panel, .inspector-trigger-popup, [data-agent-meta-content], [data-mobile-inspector-dialog]) {
  --inspector-bg: var(--theme-base-100);
  --inspector-hover-bg: color-mix(in oklab, var(--theme-base-content) 10%, var(--inspector-bg));
  --inspector-section-bg: var(--theme-base-300);
  --inspector-detail-bg: color-mix(in srgb, var(--theme-base-100) 65%, var(--theme-base-300));
  --inspector-active-text: #a7d1ff; --inspector-active-bg: #233c58; --inspector-active-border: #365778;
  --inspector-success-text: #a5dbb7; --inspector-success-bg: #233f30; --inspector-success-border: #385b45;
  --inspector-waiting-text: #f2ce83; --inspector-waiting-bg: #493a1f; --inspector-waiting-border: #65502c;
  --inspector-danger-text: #ffb2b4; --inspector-danger-bg: #512c30; --inspector-danger-border: #714044;
  --inspector-neutral-text: #c7cdd5; --inspector-neutral-bg: #343940; --inspector-neutral-border: #49505b;
}
:where(.agent-meta-panel, .inspector-trigger-popup, [data-agent-meta-content]) .inspector-status-badge { --badge-text: var(--inspector-neutral-text); --badge-bg: var(--inspector-neutral-bg); --badge-border: var(--inspector-neutral-border); display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; flex: none; min-height: 20px; max-width: 100%; padding: 1px 6px; border: 1px solid var(--badge-border); border-radius: 5px; background: var(--badge-bg); color: var(--badge-text); font-size: 10px; line-height: 16px; font-weight: 500; white-space: normal; overflow-wrap: anywhere; }
:where(.agent-meta-panel, .inspector-trigger-popup, [data-agent-meta-content]) .inspector-status-badge[data-tone="active"] { --badge-text: var(--inspector-active-text); --badge-bg: var(--inspector-active-bg); --badge-border: var(--inspector-active-border); }
:where(.agent-meta-panel, .inspector-trigger-popup, [data-agent-meta-content]) .inspector-status-badge[data-tone="success"] { --badge-text: var(--inspector-success-text); --badge-bg: var(--inspector-success-bg); --badge-border: var(--inspector-success-border); }
:where(.agent-meta-panel, .inspector-trigger-popup, [data-agent-meta-content]) .inspector-status-badge[data-tone="waiting"] { --badge-text: var(--inspector-waiting-text); --badge-bg: var(--inspector-waiting-bg); --badge-border: var(--inspector-waiting-border); }
:where(.agent-meta-panel, .inspector-trigger-popup, [data-agent-meta-content]) .inspector-status-badge[data-tone="danger"] { --badge-text: var(--inspector-danger-text); --badge-bg: var(--inspector-danger-bg); --badge-border: var(--inspector-danger-border); }
[data-agent-meta-content] .inspector-toggle-state { min-height: 18px; padding: 0 4px; font-size: 9px; }
[data-agent-meta-content] .inspector-status-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
[data-agent-meta-content] .inspector-task-status { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
[data-agent-inspector-tabs] { display: flex; flex: none; gap: 2px; padding: 6px 8px; border-bottom: 1px solid var(--ui-border); background: var(--inspector-section-bg); }
[data-agent-inspector-tab] { flex: 1; min-width: 0; min-height: 32px; padding: 5px 4px; border: 0; border-radius: 7px; font-size: 12px; font-weight: 500; color: var(--theme-text-muted); background: transparent; cursor: pointer; }
[data-agent-inspector-tab]:hover { color: var(--theme-base-content); background: var(--theme-base-300); }
[data-agent-inspector-tab][aria-selected="true"] { color: var(--theme-base-content); background: var(--inspector-bg); box-shadow: 0 1px 3px rgb(0 0 0 / .08); }
[data-agent-inspector-tab]:focus-visible, [data-agent-inspector-pane]:focus-visible { outline: 2px solid var(--theme-focus); outline-offset: -2px; }
[data-agent-inspector-pane][hidden] { display: none !important; }
[data-agent-meta-content] { min-height: 0; overscroll-behavior: contain; scrollbar-gutter: stable; }
[data-agent-inspector-pane] { min-width: 0; }
[data-agent-meta-content] .inspector-section-header { min-height: 36px; padding: 8px 12px; gap: 6px; border-bottom: 1px solid var(--ui-border); background: var(--inspector-section-bg); }
[data-agent-meta-content] .inspector-section-header h3 { margin: 0; font-weight: 600; }
[data-agent-meta-content] .inspector-section-body { border-top: 0; padding: 8px 12px 12px; background: var(--inspector-bg); }
:where([data-agent-meta-content], .inspector-trigger-popup) { overflow-wrap: anywhere; color: var(--theme-base-content); background: var(--inspector-bg); font-size: 12px; }
[data-agent-meta-content] [data-meta-section] > details > summary { min-height: 34px; padding: 6px 8px; gap: 6px; background: var(--theme-base-200); }
[data-agent-meta-content] [data-meta-section] > details > div { padding: 8px; background: var(--theme-base-200); }
:where([data-agent-meta-content], .inspector-trigger-popup) summary { list-style: none; display: flex; align-items: center; gap: 6px; min-height: 28px; padding-block: 4px; cursor: pointer; color: var(--theme-base-content); }
:where([data-agent-meta-content], .inspector-trigger-popup) summary::before { content: ''; width: 6px; height: 6px; flex: 0 0 6px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(-45deg); margin-inline: 2px 4px; }
:where([data-agent-meta-content], .inspector-trigger-popup) details[open] > summary::before { transform: rotate(45deg); }
:where([data-agent-meta-content], .inspector-trigger-popup) summary > .ph-caret-down { display: none; }
:where([data-agent-meta-content], .inspector-trigger-popup) .inspector-group { min-width: 0; margin: 0; padding: 4px 0; border: 0; }
[data-agent-meta-content] .inspector-group + .inspector-group { margin-top: 4px; }
:where([data-agent-meta-content], .inspector-trigger-popup) :is(.inspector-heading, .inspector-label, .inspector-group > legend) { font-size: 12px; font-weight: 500; }
:where([data-agent-meta-content], .inspector-trigger-popup) .inspector-label { padding-inline: 8px; margin-bottom: 2px; }
:where([data-agent-meta-content], .inspector-trigger-popup) .inspector-toggle-label { font-weight: 400; }
:where([data-agent-meta-content], .inspector-trigger-popup) .inspector-help { font-size: 12px; line-height: 1.4; color: var(--theme-text-muted); margin: 0 0 4px; }
[data-agent-meta-content] .inspector-warning { font-size: 12px; line-height: 1.4; color: var(--theme-warning); margin: 0 0 6px; }
:where([data-agent-meta-content], .inspector-trigger-popup) .inspector-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 12px; line-height: 1.4; }
:where([data-agent-meta-content], .inspector-trigger-popup) .inspector-field > span { font-weight: 400; }
:where([data-agent-meta-content], .inspector-trigger-popup) :is(input:not([type=hidden]):not([type=checkbox]), textarea, select) { min-width: 0; max-width: 100%; min-height: 28px; border: 1px solid var(--ui-input-border); border-radius: 6px; padding: 4px 6px; background: var(--theme-base-200); color: var(--theme-base-content); font-size: 12px; }
:where([data-agent-meta-content], .inspector-trigger-popup) :is(input, textarea, select, button, summary, a):focus-visible { outline: 2px solid var(--theme-focus); outline-offset: 2px; }
[data-agent-meta-content] label:has(.ui-toggle-input) { min-height: 34px; padding-block: 3px; align-items: center; }
[data-agent-meta-content] .ui-toggle-track { flex-shrink: 0; background: var(--theme-base-300) !important; }
[data-agent-meta-content] .ui-toggle-input:checked + .ui-toggle-track { background: var(--theme-focus) !important; }
[data-agent-meta-content] .ui-toggle-input:focus-visible + .ui-toggle-track { outline: 2px solid var(--theme-focus); outline-offset: 3px; }
[data-agent-meta-content] .inspector-disclosure { margin-block: 2px; font-size: 12px; }
[data-agent-meta-content] .inspector-disclosure .inspector-help p + p { margin-top: 6px; }
/* Two existing surface roles, shared by lists, settings and disclosures. */
:where([data-agent-meta-content], .inspector-trigger-popup) .inspector-surface-group { display: grid; gap: 4px; min-width: 0; padding: 0; margin-block: 4px; list-style: none; border-radius: 8px; background: var(--color-canvas); }
:where([data-agent-meta-content], .inspector-trigger-popup) .inspector-surface-row { min-width: 0; padding: 6px 8px; border: 1px solid var(--ui-border); border-radius: 6px; background: var(--theme-base-200); }
:where([data-agent-meta-content], .inspector-trigger-popup) details.inspector-surface-row { padding: 0; }
:where([data-agent-meta-content], .inspector-trigger-popup) details.inspector-surface-row > summary { padding: 6px 8px; }
:where([data-agent-meta-content], .inspector-trigger-popup) .inspector-setting-row { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 4px 8px; background: var(--theme-base-200); }
[data-agent-meta-content] .inspector-setting-row + .inspector-setting-row { border-top: 1px solid var(--ui-border); }
[data-agent-meta-content] .inspector-group.inspector-surface-group { gap: 0; }
[data-agent-meta-content] .inspector-group > legend { padding: 0 8px; margin-bottom: 2px; }
[data-agent-meta-content] .inspector-group > .inspector-help { padding: 4px 8px; }
:where([data-agent-meta-content], .inspector-trigger-popup) .inspector-disclosure > .inspector-help { padding: 6px 8px; border-top: 1px solid var(--ui-border); }
[data-agent-meta-content] :is(.inspector-task-list, .inspector-goal-list) { display: grid; gap: 4px; padding: 0; margin: 0; list-style: none; border-radius: 8px; background: var(--color-canvas); }
[data-agent-meta-content] :is(.inspector-task, .inspector-goal-row) { min-width: 0; border: 1px solid var(--ui-border); border-radius: 6px; background: var(--theme-base-200); }
[data-agent-meta-content] .inspector-task > summary { padding: 6px 8px; align-items: flex-start; }
[data-agent-meta-content] .inspector-task > summary::before { margin-top: 6px; }
[data-agent-meta-content] .inspector-task-heading { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
[data-agent-meta-content] .inspector-task-title { font-weight: 400; line-height: 1.4; overflow-wrap: anywhere; }
[data-agent-meta-content] .inspector-task-status { color: var(--theme-text-muted); font-size: 11px; line-height: 1.4; }
[data-agent-meta-content] .inspector-task-time { font-variant-numeric: tabular-nums; }
[data-agent-meta-content] .inspector-task-indicator { width: 6px; height: 6px; flex: 0 0 6px; margin-top: 5px; border-radius: 50%; background: var(--theme-text-muted); }
[data-agent-meta-content] .inspector-task[data-task-status="active"] { border-inline-start: 3px solid var(--theme-focus); }
[data-agent-meta-content] .inspector-task[data-task-status="active"] .inspector-task-indicator { background: var(--theme-focus); }
[data-agent-meta-content] .inspector-task[data-task-status="active"] .inspector-task-title { font-weight: 500; }
[data-agent-meta-content] .inspector-task[data-task-status="done"] .inspector-task-indicator { background: var(--theme-success); }
[data-agent-meta-content] .inspector-task-editor { display: grid; gap: 8px; padding: 8px; border-top: 1px solid var(--ui-border); }
[data-agent-meta-content] .inspector-task-identity { margin: 0; font-size: 11px; line-height: 1.4; color: var(--theme-text-muted); overflow-wrap: anywhere; }
[data-agent-meta-content] .inspector-task-actions { display: flex; flex-wrap: wrap; gap: 4px; }
[data-agent-meta-content] .inspector-goal-row { padding: 6px 8px; }
[data-agent-meta-content] .inspector-goal-heading { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px 8px; }
[data-agent-meta-content] .inspector-goal-statement { flex: 1 1 160px; min-width: 0; margin: 0; line-height: 1.5; font-weight: 400; }
[data-agent-meta-content] .inspector-goal-row > details { margin-top: 4px; }
[data-agent-meta-content] .inspector-goal-row > details > summary { color: var(--theme-text-muted); }
[data-agent-meta-content] .inspector-compaction-row { display: flex; align-items: flex-start; gap: 4px; }
[data-agent-meta-content] .inspector-compaction-edit { display: grid; grid-template-columns: minmax(0, 1fr) 60px auto; align-items: center; gap: 4px; flex: 1; min-width: 0; }
[data-agent-meta-content] .inspector-compaction-edit label { font-size: 12px; }
[data-agent-meta-content] .inspector-compaction-hint { grid-column: 1 / -1; grid-row: 2; margin-top: 3px; }
[data-agent-meta-content] [data-compaction-apply][hidden] { display: none; }
/* Flat rows share rhythm across all three tabs; detail editors keep their identity. */
[data-agent-meta-content] .inspector-list { display: grid; gap: 0; min-width: 0; padding: 0; margin: 0; border: 0; border-radius: 0; background: transparent; list-style: none; }
[data-agent-meta-content] .inspector-list + .inspector-list { margin-top: 12px; }
[data-agent-meta-content] .inspector-row { min-width: 0; padding: 8px 0; border: 0; border-bottom: 1px solid var(--ui-border); border-radius: 0; background: transparent; }
[data-agent-meta-content] .inspector-row:last-child { border-bottom: 0; }
[data-agent-meta-content] details.inspector-row { padding-block: 0; }
[data-agent-meta-content] details.inspector-row > summary { padding: 8px 0; }
[data-agent-meta-content] .inspector-row-title { min-width: 0; font-size: 12px; font-weight: 500; line-height: 1.45; overflow-wrap: anywhere; }
[data-agent-meta-content] .inspector-row-caption { min-width: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: 12px; line-height: 1.45; }
[data-agent-meta-content] .inspector-detail { min-width: 0; padding: 6px 0; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; white-space: normal; }
[data-agent-meta-content] .inspector-detail :is(p, dd) { overflow-wrap: anywhere; }
[data-agent-meta-content] .inspector-muted { color: var(--theme-text-muted); }
[data-agent-meta-content] .inspector-section-title { margin: 0; padding: 6px 0 4px; font-size: 12px; font-weight: 600; color: var(--theme-base-content); }
[data-agent-meta-content] .inspector-row:has(> .inspector-setting-row) { padding-block: 0; }
[data-agent-meta-content] .inspector-setting-row { padding-left: 0; padding-right: 0; background: transparent; }
[data-agent-meta-content] .inspector-section-title { margin-block: 8px 4px; padding: 10px 12px; border-radius: 6px; background: var(--inspector-detail-bg); }
[data-agent-meta-content] legend.inspector-section-title { width: 100%; box-sizing: border-box; }
[data-agent-meta-content] .inspector-detail-body { min-width: 0; margin: 4px 0 10px 8px; padding: 10px 12px; border-left: 2px solid var(--inspector-detail-rule); background: var(--inspector-detail-bg); overflow-wrap: anywhere; }
[data-agent-meta-content] .inspector-detail-body p + p { margin-top: 8px; }
[data-agent-meta-content] .inspector-detail-body .inspector-detail { padding: 0; }
[data-agent-meta-content] .inspector-detail-body .inspector-task-actions { gap: 4px 8px; }
[data-agent-meta-content] .inspector-row[open] { background: var(--inspector-detail-bg); }
[data-agent-meta-content] .inspector-row[open] > summary { padding-inline: 8px; }
[data-agent-meta-content] .inspector-row[open] > .inspector-detail-body { margin-right: 12px; }
[data-agent-meta-content] .inspector-row .inspector-task-editor { padding: 12px; margin-block: 8px 12px; background: var(--inspector-bg); border: 1px solid var(--ui-border); border-radius: 6px; }
[data-agent-meta-content] .inspector-row[data-task-status="active"] { border-inline-start: 0; }
[data-agent-meta-content] .inspector-row[data-task-status="active"] > summary { color: var(--theme-focus); }
[data-agent-meta-content] .inspector-row .inspector-goal-statement { flex-basis: 160px; }
/* Only the actual click targets react, never the entire expanded detail body.
 * Shared buttons keep their own states; hover is opt-in for mouse/trackpad. */
:is([data-agent-meta-content], .inspector-trigger-popup) :is(summary:not(.ui-button), label:has(> input[type="checkbox"]:not(:disabled)), select:not(:disabled)) { border-radius: 4px; cursor: pointer; transition: background-color .12s ease; }
@media (hover: hover) and (pointer: fine) {
  :is([data-agent-meta-content], .inspector-trigger-popup) :is(summary:not(.ui-button), label:has(> input[type="checkbox"]:not(:disabled)), select:not(:disabled)):hover { background: var(--inspector-hover-bg); }
}
:is([data-agent-meta-content], .inspector-trigger-popup) :is(summary:not(.ui-button), select:not(:disabled)):focus-visible,
:is([data-agent-meta-content], .inspector-trigger-popup) label:has(> input[type="checkbox"]:focus-visible) { background: var(--inspector-hover-bg); outline: 2px solid var(--theme-focus); outline-offset: 2px; }
:is([data-agent-meta-content], .inspector-trigger-popup) :is(summary:not(.ui-button), label:has(> input[type="checkbox"]:not(:disabled)), select:not(:disabled)):active { background: var(--inspector-pressed-bg); transition: none; }
@media (pointer: coarse), (max-width: 700px) {
  [data-agent-inspector-tab] { min-height: 44px; font-size: 14px; }
}
@media (pointer: coarse), (max-width: 700px) {
  [data-agent-meta-content] :is(.inspector-setting-row, label:has(.ui-toggle-input)) { min-height: 44px; }
  :where([data-agent-meta-content], .inspector-trigger-popup) a[href] { display: inline-flex; align-items: center; min-height: 44px; }
  :where([data-agent-meta-content], .inspector-trigger-popup) :is(button, summary, select, input:not([type=hidden]):not([type=checkbox])) { min-height: 44px; }
  [data-agent-meta-content] [data-meta-section] > details > summary { min-height: 44px; }
  :where([data-agent-meta-content], .inspector-trigger-popup) :is(input:not([type=hidden]), textarea, select) { font-size: 16px !important; }
}
@media (prefers-reduced-motion: reduce) {
  .agent-meta-panel, :where([data-agent-meta-content], .inspector-trigger-popup) * { transition: none !important; animation: none !important; }
}
.chat-composer [data-chat-jump-wrap] { display: none; }
.chat-table-block, .chat-table-scroll { display: contents; }
.chat-table-hint { display: none; }
.chat-composer [data-composer-running-controls] { display: inline-flex; align-items: center; gap: .25rem; }
.chat-composer[data-composer-send-ready]:not([data-composer-has-content]) [data-composer-running-controls] [data-composer-send] { display: none !important; }
@media (max-width: 700px), (max-width: 1023px) and (pointer: coarse) {
  .mobile-usage-strip { display: flex; flex: none; align-items: center; gap: .5rem; min-width: 0; width: 100%; height: 44px; min-height: 44px; box-sizing: border-box; padding: .25rem max(.75rem, env(safe-area-inset-right)) .25rem max(.75rem, env(safe-area-inset-left)); border: 0; border-bottom: 1px solid var(--color-ui-border); background: var(--color-base-100); text-align: left; color: var(--color-base-content); font-size: 12px; cursor: pointer; }
  .mobile-usage-strip[data-home-mobile-usage] { margin-top: 2.25rem; border-top: 1px solid var(--color-ui-border); }
  [data-mobile-usage-items] { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; overflow: hidden; }
  .mobile-usage-chip { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 32px; width: 32px; height: 32px; min-width: 0; padding: 0; color: var(--color-muted); }
  .mobile-usage-chip[hidden] { display: none; }
  .mobile-usage-ring { position: relative; display: flex; flex: none; width: 28px; height: 28px; align-items: center; justify-content: center; }
  .mobile-usage-ring-track { position: absolute; inset: 0; width: 28px; height: 28px; transform: rotate(-90deg); }
  .mobile-usage-chip[data-tone="warning"] { color: var(--color-warning); }
  .mobile-usage-chip[data-tone="critical"] { color: var(--color-critical); }
  .mobile-usage-chip[data-tone="error"] { color: var(--color-error); }
  .mobile-usage-chip[data-quota-state="stale"] [data-usage-fill] { opacity: .35; }
  .mobile-usage-ring > .mobile-usage-logo { position: relative; width: 16px; height: 16px; line-height: 1; }
  .mobile-usage-ring > .mobile-usage-logo > span { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; color: inherit; }
  .mobile-usage-ring > .mobile-usage-logo svg { width: 14px; height: 14px; }
  .mobile-usage-ring > .mobile-usage-logo i, .mobile-usage-provider-glyph { font-size: 14px; line-height: 1; }
  .mobile-usage-ring > .mobile-usage-logo .ph-arrows-left-right { display: none; }
  .mobile-usage-proxy { position: absolute; bottom: -1px; right: -1px; width: 10px; height: 10px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--color-base-100); font-size: 9px; line-height: 1; }
  .mobile-usage-pause { font-size: 11px; }
  .mobile-usage-gateway { position: absolute; bottom: 0; right: 0; width: 6px; height: 6px; border-radius: 50%; background: var(--color-base-300); }
  .mobile-usage-gateway[data-status="available"] { background: var(--color-success); }
  .mobile-usage-gateway[data-status="unavailable"] { background: var(--color-error); }
  [data-mobile-usage-count] { flex: none; min-width: 3.25em; text-align: right; font-variant-numeric: tabular-nums; color: var(--color-muted); }
  .mobile-usage-placeholder { color: var(--color-muted); white-space: nowrap; }
  .mobile-usage-dialog { position: fixed; inset: var(--chat-viewport-top, 0px) 0 auto; margin: 0; width: 100%; height: var(--chat-viewport-height, 100dvh); border: 0; border-radius: 0; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); box-sizing: border-box; }

  html, body, #frame { width: 100%; height: 100dvh; min-height: 0; overflow: hidden; }
  body { -webkit-text-size-adjust: 100%; overscroll-behavior: none; }
  #dock { display: none !important; }
  #chat-panel .chat-header-actions > [data-mobile-inspector-open][data-inspector-ready] { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 2.75rem; min-height: 2.75rem; border-radius: .65rem; color: var(--color-muted); font-size: 1.25rem; }
  [data-mobile-inspector-dialog] { position: fixed; inset: var(--chat-viewport-top, 0px) 0 auto; margin: 0; padding: 0; width: 100%; max-width: none; height: var(--chat-viewport-height, 100dvh); max-height: none; border: 0; border-radius: 0; overflow: hidden; color: var(--color-base-content); background: var(--inspector-bg); }
  [data-mobile-inspector-dialog]::backdrop { background: var(--inspector-bg); }
  [data-mobile-inspector-dialog] > .agent-meta-panel { display: flex !important; width: 100% !important; min-width: 0 !important; height: 100%; max-height: none; margin: 0; border: 0; border-radius: 0; box-shadow: none; transition: none; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); box-sizing: border-box; background: var(--inspector-bg); }
  [data-mobile-inspector-dialog] [data-desktop-inspector-header] { display: none; }
  [data-mobile-inspector-dialog] [data-mobile-inspector-header] { display: flex; height: auto !important; min-height: 3.5rem; flex: none; align-items: center !important; justify-content: flex-start !important; gap: .75rem; padding: .25rem .75rem !important; border-bottom: 1px solid var(--color-ui-border) !important; }
  [data-mobile-inspector-header] > div { min-width: 0; }
  [data-mobile-inspector-header] h2 { margin: 0; font-size: 1.0625rem; font-weight: 600; }
  [data-mobile-inspector-header] p { margin: 0; font-size: .8125rem; color: var(--color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-mobile-inspector-close] { display: inline-flex; align-items: center; gap: .4rem; min-height: 2.75rem; flex: none; padding-inline: .35rem; font-size: 1rem; }
  [data-mobile-inspector-dialog] [data-agent-meta-content] { display: block !important; min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; font-size: 1rem; }
  [data-mobile-inspector-dialog] [data-agent-inspector-tabs] { display: flex !important; }
  [data-mobile-inspector-dialog] [data-agent-inspector-tab] { min-height: 44px; }
  [data-mobile-inspector-dialog] .inspector-section-body { padding-inline: 14px; }
  [data-mobile-inspector-dialog] .inspector-section-header { padding-inline: 14px; }
  [data-mobile-inspector-dialog] :is(button, summary, select) { min-height: 2.75rem; }
  [data-mobile-inspector-dialog] button { min-width: 2.75rem; }
  [data-mobile-inspector-dialog] summary { display: flex; align-items: center; font-size: 1rem; }
  [data-mobile-inspector-dialog] summary > .truncate { font-size: 1rem; line-height: 1.4; }
  [data-mobile-inspector-dialog] :is(input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select) { font-size: max(16px, 1rem) !important; max-width: 100%; }
  [data-mobile-inspector-dialog] :is(button, summary, input, textarea, select):focus-visible, #chat-panel [data-mobile-inspector-open]:focus-visible { outline: 2px solid var(--color-base-content); outline-offset: -2px; }
  [data-mobile-inspector-dialog] button:active { background: var(--color-base-200); }
  body[data-presentation="sidebar"] [data-mobile-inspector-open] { display: none !important; }
  #page-view { width: 100%; height: 100%; min-height: 0; overflow: hidden; }
  /* #main is the page scroller: with overflow hidden every ordinary page on a
   * phone showed only its first screen. The chat page keeps its own inner
   * scroller (#messages), so it opts out below. */
  #main { width: 100%; height: 100%; min-height: 0; overflow-x: hidden; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  #main:has(> [data-page="agent"]) { overflow: hidden; }
  /* Keep one small project row instead of the desktop tab strip. */
  #main:has(> [data-page="agent"]) > #project-tabs-host { display: block; flex-shrink: 0; position: relative; z-index: 45; }
  #main:has(> [data-page="agent"]) > #project-tabs-host:has(.project-mobile-bar) { padding-top: env(safe-area-inset-top); padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); background: var(--color-base-100); }
  #main:has(> #project-tabs-host .project-mobile-bar) #chat-panel { padding-top: 0; }
  #project-tabs-host .project-tabs { display: none; }
  .project-mobile-bar { display: flex; align-items: center; gap: .25rem; min-width: 0; height: 2.75rem; padding: 0 .5rem 0 3.5rem; background: var(--color-base-100); color: var(--color-muted); }
  .project-mobile-name { display: flex; align-items: center; gap: .4rem; min-width: 0; flex: 1; overflow: hidden; min-height: 2.75rem; font-size: .8125rem; }
  .project-mobile-name .project-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .project-mobile-activity { display: inline-flex; flex-shrink: 0; }
  .project-activity-spin { display: inline-block; animation: chat-icon-spin 1.1s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .project-activity-spin { animation: none; } }
  .project-mobile-toggle, .project-mobile-manage { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: .35rem; min-height: 2.75rem; min-width: 2.75rem; padding-inline: .4rem; font-size: .8125rem; cursor: pointer; border-radius: .6rem; }
  .project-mobile-toggle > i, .project-mobile-manage > i { font-size: 1.2rem; }
  .project-mobile-bar [aria-expanded="true"] { background: var(--color-base-200); color: var(--color-base-content); }
  .project-mobile-bar :is(a,button):focus-visible { outline: 2px solid var(--color-base-content); outline-offset: -2px; }
  .project-mobile-bar :is(a,button):active { background: var(--color-base-200); }
  #main:not(:has(> [data-page="agent"])):has(> #project-tabs-host .project-mobile-bar) { padding-top: env(safe-area-inset-top); }
  html[data-chat-viewport] #frame { position: fixed; inset: var(--chat-viewport-top, 0px) 0 auto; height: var(--chat-viewport-height, 100dvh); }
  html[data-chat-viewport] #mobile-nav-button { position: absolute; }
  #chat-panel { min-height: 0; padding-top: env(safe-area-inset-top); padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }
  /* The floating menu button sits over the page's top-left corner; ordinary
   * pages start below it so it never covers a title or a breadcrumb. */
  #main:not(:has(> [data-page="agent"])) { padding-top: calc(env(safe-area-inset-top) + 3.25rem); padding-bottom: env(safe-area-inset-bottom); padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }
  #mobile-nav-button { display: inline-flex !important; position: fixed; z-index: 49; top: max(.4rem, env(safe-area-inset-top)); left: max(.5rem, env(safe-area-inset-left)); width: 2.75rem; height: 2.75rem; align-items: center; justify-content: center; border-radius: 9999px; border: 1px solid var(--color-ui-border); background: rgb(from var(--color-base-100) r g b / .82); color: color-mix(in oklab, var(--color-base-content) 72%, transparent); box-shadow: inset 0 1px 0 rgb(255 255 255 / .25), 0 5px 18px rgb(0 0 0 / .14); backdrop-filter: blur(16px) saturate(120%); -webkit-backdrop-filter: blur(16px) saturate(120%); touch-action: manipulation; }
  #mobile-nav-button:active { transform: scale(.94); }
  #chat-panel > header { padding-left: 3.1rem !important; }
  #nav-overlay { padding: max(.5rem, env(safe-area-inset-top)) max(.5rem, env(safe-area-inset-right)) max(.5rem, env(safe-area-inset-bottom)) max(.5rem, env(safe-area-inset-left)) !important; }
  /* Keep the mobile menu and its safe-area surround opaque and theme-matched. */
  #nav-overlay { background: var(--color-base-100); backdrop-filter: none; -webkit-backdrop-filter: none; }
  #nav-overlay [role="dialog"] { border-radius: 1.25rem; }
  #nav-overlay .nav-row { min-height: 3rem; }
  #nav-overlay [data-nav-keyboard-help] { display: none; }
  #nav-results { overscroll-behavior-y: contain; }
  #nav-overlay button, #nav-overlay select, #nav-overlay summary { min-height: 2.75rem; }
  #nav-overlay button, #app-popup-close { min-width: 2.75rem; min-height: 2.75rem; }
  #nav-results .nav-row + form[hx-post] { opacity: 1; }
  #nav-overlay input:not([type="hidden"]), #nav-overlay select,
  #app-popup input:not([type="hidden"]), #app-popup textarea, #app-popup select,
  [data-chat-panel] input:not([type="hidden"]), [data-chat-panel] textarea, [data-chat-panel] select { font-size: max(16px, 1rem) !important; }
  [data-chat-panel] .chat-row { min-height: 2.75rem !important; }
  [data-page="agent"] { width: 100%; height: 100%; min-height: 0; overflow: hidden; }
  [data-page="agent"] > aside[id^="agent-meta-"] { display: none !important; }
  #chat-panel { width: 100%; min-width: 0; }
  #chat-panel > header { left: env(safe-area-inset-left); right: env(safe-area-inset-right); width: calc(100% - 1rem - env(safe-area-inset-left) - env(safe-area-inset-right)) !important; max-width: none !important; margin-top: max(.4rem, env(safe-area-inset-top)) !important; padding-right: .55rem !important; gap: .4rem !important; }
  button, a, select, input[type="checkbox"], input[type="radio"] { touch-action: manipulation; }
  #chat-panel > header button:not(.hidden):not([data-chat-panel] *), #chat-panel > header a:not(.hidden):not([data-chat-panel] *) { min-width: 2.75rem; min-height: 2.75rem; display: inline-flex; align-items: center; justify-content: center; }
  #chat-panel > header select { min-height: 2.75rem; }
  .chat-composer button { min-width: 2.75rem; min-height: 2.75rem; }

  #chat-panel > header [data-chat-badges] > :not([data-chat-id="agent.status"]) { display: none !important; }
  #messages, #messages > *, #messages .assistant, #messages .user, #messages .tool { min-width: 0; max-width: 100%; }
  #messages { min-height: 0; overflow-x: hidden !important; overscroll-behavior-y: contain; }
  #messages .tool { min-width: 2.25rem; min-height: 2.25rem; padding: .45rem; touch-action: manipulation; }
  #messages button[data-action="delete-one"], #messages button[data-action="delete-from"] { min-width: 2.25rem; min-height: 2.25rem; }
  #messages [data-load-older] { min-height: 2.75rem; padding-inline: 1rem; }

  #messages .sr-only { width: 1px !important; max-width: 1px !important; overflow: hidden !important; white-space: nowrap !important; }

  #messages .group > .relative > .absolute { display: none !important; }

  #messages [class*="max-w-"] { min-width: 0; }
  #messages .prose, #messages p, #messages li { overflow-wrap: anywhere; word-break: break-word; }
  #messages pre, #messages .shiki { max-width: 100%; overflow-x: auto !important; overflow-wrap: normal; word-break: normal; }
  #messages img, #messages video, #messages svg { max-width: 100%; }
  /* Never force table columns into the phone's width or break IDs one digit at a time. */
  #messages .assistant, #messages .prose { min-width: 0; max-width: 100%; }
  #messages table { display: block; max-width: 100%; overflow-x: auto; word-break: normal; overflow-wrap: normal; }
  #messages table :is(th, td, p, li) { word-break: normal; overflow-wrap: break-word; }
  #messages table :is(th, td) { min-width: 6rem; max-width: 22rem; padding: .65rem .75rem; vertical-align: top; font-size: .9375rem; line-height: 1.5; }
  #messages table th { white-space: nowrap; }
  #messages table :is(th, td):first-child { min-width: 4.5rem; }
  #messages .chat-table-block { display: block; min-width: 0; max-width: 100%; margin-block: 1rem; }
  #messages .chat-table-hint { display: block; margin-bottom: .35rem; font-size: .75rem; line-height: 1.4; color: var(--color-muted); }
  #messages .chat-table-scroll { display: block; width: 100%; max-width: 100%; overflow-x: auto; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; border: 1px solid var(--color-ui-border); border-radius: .65rem; }
  #messages .chat-table-scroll:focus-visible { outline: 2px solid var(--color-base-content); outline-offset: 2px; }
  #messages .chat-table-scroll > table { display: table; width: max-content; min-width: 100%; max-width: none; table-layout: auto; overflow: visible; margin: 0; }
  #messages .chat-table-scroll th { background: var(--color-base-200); }
  #messages .chat-table-scroll tbody tr:last-child { border-bottom-width: 0; }
  .chat-composer > * { max-width: 100%; min-width: 0; }

  .chat-dot-grid { padding: 1rem !important; }
  .chat-dot-grid > * { max-width: 100% !important; }
  .chat-composer { width: calc(100% - .75rem) !important; max-width: none !important; margin-top: 0; margin-bottom: max(.25rem, env(safe-area-inset-bottom)) !important; padding-top: .5rem !important; }
  .chat-composer textarea[name="text"] { max-height: min(40vh, calc(var(--chat-viewport-height, 100dvh) * .3)); }
  .chat-composer textarea[name="text"] { font-size: max(16px, 1.0625rem) !important; line-height: 1.5; }
  #app-popup { width: calc(100vw - 1rem) !important; max-height: calc(var(--chat-viewport-height, 100dvh) - 1rem) !important; }
  #app-popup[data-popup-kind="tool"] { position: fixed; inset: auto .5rem; top: calc(var(--chat-viewport-top, 0px) + var(--chat-viewport-height, 100dvh) / 2); translate: 0 -50%; margin: 0 auto; width: calc(100vw - 1rem) !important; height: auto; max-height: min(85dvh, calc(var(--chat-viewport-height, 100dvh) - 1rem)) !important; border: 1px solid var(--color-ui-border); border-radius: 1rem; }
  #app-popup[data-popup-kind="tool"] > div { height: auto; max-height: min(85dvh, calc(var(--chat-viewport-height, 100dvh) - 1rem)) !important; padding-top: 0; box-sizing: border-box; }
  #app-popup[data-popup-kind="tool"] > div > div:first-child { min-height: 3.25rem; padding: 1rem 1.25rem .85rem; }
  #app-popup[data-popup-kind="tool"]::backdrop { background: rgb(0 0 0 / .32); }
  #app-popup[data-popup-kind="tool"] #app-popup-close { display: none; }
  #app-popup[data-popup-kind="tool"] #app-popup-body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 1rem max(1.25rem, env(safe-area-inset-right)) 1rem max(1.25rem, env(safe-area-inset-left)); background: var(--color-base-100); }
  #app-popup[data-popup-kind="tool"] [data-tool-popup-footer] { display: block; flex-shrink: 0; padding: .65rem max(.75rem, env(safe-area-inset-right)) max(.65rem, env(safe-area-inset-bottom)) max(.75rem, env(safe-area-inset-left)); border-top: 1px solid var(--color-ui-border); background: var(--color-base-100); }
  #app-popup [data-tool-popup-close] { display: flex; width: 100%; min-height: 48px; align-items: center; justify-content: center; border-radius: .85rem; background: var(--color-base-200); color: var(--color-base-content); font-size: 1rem; font-weight: 600; }
  /* Keep mobile notifications away from the navigation header. Show one at a time. */
  #toasts { top: auto !important; bottom: max(8rem, calc(env(safe-area-inset-bottom) + 8rem)) !important; right: .75rem !important; left: .75rem; align-items: stretch !important; flex-direction: column !important; }
  #toasts > :not(:last-child) { display: none; }
  #toasts > .hyper-toast { max-width: 100%; max-height: 25dvh; overflow-y: auto; background: var(--theme-base-100); border-color: var(--ui-border); box-shadow: 0 4px 20px rgb(0 0 0 / .15); }
  #toasts .toast-detail { max-height: 4.5rem; }
  @media (prefers-reduced-motion: reduce) { #toasts > .hyper-toast { transition: none; transform: none; } }
  #app-popup > div { max-height: calc(var(--chat-viewport-height, 100dvh) - 1rem) !important; }
  /* Phone reading surface: quiet content, real controls, no desktop changes. */
  #chat-panel, #chat-panel #messages { background-color: var(--color-base-100); background-image: none; }
  /* A normal flex header cannot float over messages or consume safe-area twice. */
  #chat-panel > header.glass-bar { position: relative; inset: auto; left: auto; right: auto; width: 100% !important; max-width: none !important; margin: 0 !important; height: auto; min-height: 3.25rem; flex-shrink: 0; padding: .25rem .5rem .25rem 3.5rem !important; gap: .25rem !important; border: 0; border-bottom: 1px solid var(--color-ui-border); border-radius: 0; background-color: var(--color-base-100) !important; background-image: none; backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: none; }
  #chat-panel > header [data-chat-part="icon"] { display: inline-flex !important; }
  /* Keep the chat's assigned avatar (or its single model fallback) on phones too. */
  #chat-panel > header [data-chat-avatar] { display: inline-flex; }
  #chat-panel > header .chat-toolbar-label { display: none; }
  #chat-panel > header .chat-toolbar-button { width: 2.75rem; padding-inline: 0; }
  #chat-panel > header .chat-header-actions, #chat-panel > header [data-chat-buttons] { gap: 0; }
  #chat-panel > header .chat-header-identity { position: relative; height: 2.75rem; }
  #chat-panel > header .chat-header-name { display: block !important; width: 100%; height: 2.75rem; min-height: 2.75rem; padding: .125rem 0 1rem; margin: 0; font-size: .9375rem; text-align: left; }
  #chat-panel > header .chat-header-meta { position: absolute; bottom: .125rem; left: 0; right: 0; height: 1rem; margin: 0; gap: .35rem; pointer-events: none; overflow: hidden; }
  #chat-panel > header .chat-header-badges { max-height: 1rem; }
  #chat-panel > header .chat-header-badges :is(button,a) { min-width: 0; min-height: 0; padding: 0; }
  #chat-panel > header .chat-header-badges svg { width: 1rem; height: 1rem; }
  /* Put failed-run recovery on its own row: a real touch target without covering rename. */
  #chat-panel > header:has([data-agent-retry]) { display: grid; grid-template-columns: 2.75rem minmax(0, 1fr) auto; }
  #chat-panel > header:has([data-agent-retry]) > [data-chat-part="icon"] { grid-column: 1; grid-row: 1; }
  #chat-panel > header:has([data-agent-retry]) .chat-header-identity { display: contents; }
  #chat-panel > header:has([data-agent-retry]) .chat-header-name { grid-column: 2; grid-row: 1; padding: .125rem 0; }
  #chat-panel > header:has([data-agent-retry]) .chat-header-actions { grid-column: 3; grid-row: 1; }
  #chat-panel > header:has([data-agent-retry]) .chat-header-meta { position: static; grid-column: 1 / -1; grid-row: 2; height: auto; min-height: 2.75rem; pointer-events: auto; overflow: visible; }
  #chat-panel > header:has([data-agent-retry]) .chat-header-badges { max-height: none; }
  #chat-panel > header .chat-header-badges .chat-response-retry { width: 2.75rem; height: 2.75rem; min-width: 2.75rem; min-height: 2.75rem; }
  #chat-panel > header .chat-header-avatar { background: transparent; }
  #chat-panel > header .chat-toolbar-more { margin-left: .125rem; }
  #chat-panel #messages { scrollbar-gutter: auto; }
  .inplace-popup-panel[data-chat-panel] { top: auto !important; bottom: 0; left: 0 !important; right: 0 !important; width: 100% !important; max-height: min(85dvh, calc(var(--chat-viewport-height, 100dvh) - 3.5rem)); margin: 0; border-radius: 1.25rem 1.25rem 0 0; padding-bottom: env(safe-area-inset-bottom); }
  .inplace-popup-panel[data-chat-panel]::backdrop { background: rgb(0 0 0 / .18); }
  [data-chat-panel] .chat-panel-title button { min-width: 44px; min-height: 44px; }
  [data-chat-panel] :is(.chat-row, summary) { min-height: 48px; }
  #main:has(> #project-tabs-host .project-mobile-bar) #chat-panel > header.glass-bar { min-height: 2.75rem; padding-left: .5rem !important; }
  body:has(#main > #project-tabs-host .project-mobile-bar):has(#main > [data-page="agent"]) #mobile-nav-button { top: env(safe-area-inset-top); }
  #chat-panel > header > div:has([data-chat-part="name"]) { flex: 1; }
  body:has(#main > [data-page="agent"]) #mobile-nav-button { top: calc(env(safe-area-inset-top) + .35rem); border: 0; background: transparent; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
  #chat-panel [data-chat-part="name"] { display: block !important; min-width: 0 !important; font-family: inherit; font-size: 1.0625rem; font-weight: 600; line-height: 1.35; color: var(--color-base-content); }
  #chat-panel #messages .assistant.chat-glass { background: transparent; border-color: transparent !important; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; padding: .75rem 0; }
  #chat-panel #messages .assistant > .prose { font-size: 1.0625rem; line-height: 1.6; }
  #chat-panel #messages .assistant > .prose > p { margin-block: .7em; }
  #chat-panel #messages .chat-glass-primary { background: var(--color-base-200); color: var(--color-base-content); font-size: 1.0625rem; line-height: 1.55; border-color: transparent; border-radius: 1.25rem 1.25rem .4rem 1.25rem; padding: .75rem 1rem; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
  #chat-panel #messages .chat-glass-primary > [data-author] { color: var(--color-base-content) !important; }
  #chat-panel #messages .chat-glass-primary [data-no-copy] { color: var(--color-muted); }
  #chat-panel #messages .chat-glass-primary [data-mention] { color: var(--color-base-content); background: var(--color-base-300); }
  #chat-panel #messages .chat-glass-primary a[href^="/attachments/"] { background-color: var(--color-base-300); border-color: var(--color-ui-border); }
  #chat-panel #messages .chat-glass-primary > [aria-label^="Gate:"] > span:first-child:not(.text-error) { color: var(--color-muted); border-color: var(--color-muted); }
  #chat-panel .chat-composer { position: relative; border-top: 1px solid var(--color-ui-border); padding-top: .65rem !important; }
  #chat-panel [data-chat-jump-wrap] { display: flex; position: absolute; left: 0; right: 0; bottom: calc(100% + .4rem); justify-content: center; pointer-events: none; z-index: 20; }
  #chat-panel [data-chat-jump] { display: inline-flex; align-items: center; justify-content: center; gap: .45rem; min-height: 2.75rem; padding: .45rem .85rem; border: 1px solid var(--color-ui-border); border-radius: 9999px; background: var(--color-base-100); color: var(--color-base-content); font-size: .8125rem; box-shadow: 0 2px 8px rgb(0 0 0 / .12); pointer-events: auto; touch-action: manipulation; }
  #chat-panel [data-chat-jump][hidden], #chat-panel [data-chat-jump-count][hidden] { display: none; }
  #chat-panel [data-chat-jump-count] { display: inline-flex; min-width: 1.25rem; min-height: 1.25rem; padding-inline: .3rem; align-items: center; justify-content: center; border-radius: 9999px; background: var(--color-base-content); color: var(--color-base-100); font-size: .75rem; font-variant-numeric: tabular-nums; }
  #chat-panel [data-chat-jump]:focus-visible { outline: 2px solid var(--color-base-content); outline-offset: 2px; }
  #chat-panel .chat-composer .chat-box.glass-input { background-color: var(--color-base-200) !important; background-image: none; border: 1px solid var(--color-ui-border); box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
  #chat-panel .chat-composer .chat-box:focus-within { border-color: var(--color-base-content); box-shadow: 0 0 0 1px var(--color-base-content); }
  #chat-panel [data-composer-toolbar] { flex-wrap: wrap; align-items: center; gap: .125rem; }
  #chat-panel .chat-composer[data-composer-send-ready]:not([data-composer-has-content]) [data-composer-send] { display: none !important; }
  #chat-panel .chat-composer[data-composer-settings-ready] [data-composer-settings-toggle] { display: inline-flex !important; }
  #chat-panel [data-composer-settings] { display: flex; flex: 1 0 100%; order: 10; align-items: center; flex-wrap: wrap; gap: .35rem; padding-top: .35rem; border-top: 1px solid var(--color-ui-border); max-height: min(12rem, calc(var(--chat-viewport-height, 100dvh) * .35)); overflow-y: auto; }
  #chat-panel .chat-composer[data-composer-settings-ready] [data-composer-settings]:not([data-open]) { display: none; }
  #chat-panel [data-composer-settings-toggle][aria-expanded="true"] { background: var(--color-base-300); color: var(--color-base-content); }
  #chat-panel [data-dictate] { margin-left: 0; }
  #chat-panel [data-composer-submit] { flex: none; }
  #chat-panel [data-composer-send] > i { font-size: 1.25rem; }
  #mobile-nav-button > i, #chat-panel > header > button > i,
  #chat-panel [data-attach-button] > i, #chat-panel [data-composer-settings-toggle] > i,
  #chat-panel [data-dictate] > i, #chat-panel [data-composer-submit] > button > i { font-size: 1.25rem; }
  #chat-panel [data-chat-tools] { flex: 1 1 8rem; min-width: 0; flex-wrap: wrap; }
  #chat-panel [data-chat-meters] { flex-wrap: nowrap; margin-left: auto; }
  #chat-panel [data-chat-status] { margin-left: auto; }
  #chat-panel [data-context-total] { font-size: .8125rem; }
  #chat-panel [data-context-meter] { min-height: 2.75rem; padding-inline: .2rem; }
  #chat-panel [data-chat-tools] [data-chat-part="model"] { max-width: 100%; }
  #chat-panel [data-chat-tools] [data-chat-part="model"] > span { min-width: 0; }
  #chat-panel .chat-composer [data-chat-part] { font-size: .8125rem; }
  #nav-overlay [role="dialog"] { background: var(--color-base-100); }
  #nav-overlay [data-nav-widget] { padding: 1rem .75rem; }
  #nav-overlay [data-nav-widget] > h3 { font-size: .8125rem; line-height: 1.4; letter-spacing: .015em; text-transform: none; color: var(--color-muted); }
  #nav-overlay [data-nav-widget] h4 { font-size: .8125rem; line-height: 1.4; text-transform: none; letter-spacing: .01em; }
  #nav-overlay .nav-row { padding: .7rem .5rem; border-radius: .75rem; gap: .65rem; }
  #nav-overlay [data-nav-label] { font-size: 1.0625rem; line-height: 1.4; font-weight: 500; color: var(--color-base-content); }
  #nav-overlay [data-nav-detail], #nav-overlay [data-nav-hint], #nav-overlay [data-owner] { font-size: .8125rem; line-height: 1.4; color: var(--color-muted); }
  #nav-overlay [data-nav-technical-id] { display: none; }
  #nav-overlay [data-widget-type="chats"] .nav-row { min-height: 3.5rem; }
  #nav-overlay .nav-row:active, #nav-overlay button:active, #chat-panel > header button:active, #chat-panel > header a:active, #chat-panel .chat-composer button[type="button"]:active { background-color: var(--color-base-300); }
  #chat-panel .chat-composer button[type="submit"]:active { opacity: .7; }
  #nav-overlay :is(button, a, input):focus-visible { outline: 2px solid var(--color-base-content); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    #mobile-nav-button:active, #chat-panel .tool { transform: none; transition: none; }
  }
  @media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
    #mobile-nav-button, #chat-panel > header.glass-bar, #chat-panel .chat-composer .chat-box.glass-input { background-color: var(--color-base-100) !important; backdrop-filter: none; -webkit-backdrop-filter: none; border: 1px solid var(--color-base-content); }
  }

}


/* iOS zooms focused inputs below 16px. Target the editable textarea itself:
 * .glass-input is only its wrapper. Touch detection also covers landscape iPhones.
 * Keep native pinch-to-zoom available and preserve desktop typography. */
@media (hover: none) and (pointer: coarse) {
  .chat-composer textarea[name="text"] { font-size: max(16px, 1.0625rem) !important; line-height: 1.5; }
}


/* Sidebar presentation reuses the page and live chat, independent of viewport. */
body[data-presentation="sidebar"] #dock,
body[data-presentation="sidebar"] #mobile-nav-button,
body[data-presentation="sidebar"] #nav-overlay,
body[data-presentation="sidebar"] [data-page="agent"] > aside[id^="agent-meta-"] { display: none !important; }
body[data-presentation="sidebar"] #chat-panel > header { padding-left: .55rem !important; }
</style>

<style>
  body { font-family: var(--font-sans); }
  .shiki { background: transparent !important; }
  .assistant pre.shiki { padding: .6em .8em; border-radius: 6px; overflow-x: auto; margin: .4em 0; font-size: 12.5px; line-height: 1.45; }
  .tool pre.shiki { padding: 0; margin: 0; overflow-x: auto; }
  .ui-toggle-track { position: relative; display: block; flex: none; width: 40px; height: 20px; box-sizing: border-box; border-radius: 9999px; background: rgb(229 231 235); transition: background-color .15s ease, box-shadow .15s ease; }
  .ui-toggle-thumb { position: absolute; top: 2px; display: block; width: 16px; height: 16px; border-radius: 9999px; background: white; box-shadow: 0 1px 2px rgb(0 0 0 / .18); transition: left .15s ease; }
  .ui-toggle-input:focus-visible + span.ui-toggle-track { box-shadow: 0 0 0 2px rgb(199 210 254); }

  #app-popup[data-popup-kind="file-preview"] { width: min(90rem, calc(100vw - 2rem)) !important; height: 97vh !important; max-height: 97vh !important; }
  #app-popup[data-popup-kind="file-preview"] > div { height: 100%; max-height: 100% !important; }
  #app-popup[data-popup-kind="file-preview"] .app-popup-body { overflow: hidden !important; padding: 0 !important; }

</style>
${((ctx.state as any).procs?.styles ?? []).map((st: any) => `<link rel="stylesheet" href="${esc(st.href)}">`).join("\n")}
${opts.headExtra ?? ""}
<!-- client.js first: every later script subscribes through window.hyperLive (docs/live-updates.md). -->
<script src="/procs/events/client.js" defer></script>
<script src="/ui/control.js" defer></script>
<script src="/ui/hotkeys.js" defer></script>
<script src="/ui/rpc.js?v=6" defer></script>
<script src="/ui/pressFeedback.js" defer></script>
<script src="/agent/chat.js" defer></script>
<script src="/ui/dictation.js" defer></script>
<script src="/ui/popup.js" defer></script>
<script src="/chat/header.js" defer></script>
<script src="/ui/meta.js" defer></script>
<script src="/ui/mobileInspector.js" defer></script>
<script src="/ui/codeBlocks.js" defer></script>
<script src="/ui/mobileMessage.js" defer></script>
<script src="/ui/chatSearch.js" defer></script>
<script src="/ui/quotaTip.js" defer></script>
<script src="/ui/mobileUsage.js" defer></script>
<script src="/ui/webPush.js" defer></script>
<script src="/screen/client.js" defer></script>
<script src="/ui/wake-timer.js" defer></script>
<script src="/ui/spin-sync.js" defer></script>
<script src="/ui/tool-timer.js" defer></script>
${hideNavigation ? "" : '<script src="/projects/reorder.js" defer></script><script src="/projects/navigation.js" defer></script>'}
<style>
/* Quota ring hover card: the name, the limits and the reset moment — nothing else.
   It lives in the top layer (Popover API): the dock's backdrop-filter creates a
   stacking context, so no z-index inside the dock can lift anything above the
   chat column. The quotaTip script pins it to the ring with fixed coordinates. */
.quota-tip { position:fixed; inset:auto; margin:0; width:max-content; height:auto; box-sizing:border-box; overflow:visible; display:flex; flex-direction:column; gap:6px; min-width:min(12.5rem, calc(100vw - 16px)); max-width:min(24rem, calc(100vw - 16px)); max-height:calc(100dvh - 16px); text-align:left; white-space:normal; overflow-wrap:anywhere; padding:.5rem .65rem .55rem; border:1px solid var(--ui-border-strong, var(--color-ui-border)); border-radius:.6rem; background:var(--color-base-100); box-shadow:0 10px 28px rgb(0 0 0 / .16), 0 2px 6px rgb(0 0 0 / .08); font-size:11px; line-height:1.45; color:var(--color-muted); pointer-events:none; opacity:1; transform:none; transition:opacity .12s ease, transform .12s ease, overlay .12s allow-discrete; }
/* Author styles outrank the UA sheet, so the closed state must be restated
   explicitly — otherwise every card is visible on load and hidePopover() has
   nothing to close. overflow:visible matters too: the UA popover default is
   overflow:auto, which turns the caret hanging 5px below the card into a
   scrollbar. */
.quota-tip:not(:popover-open) { display:none; }
@starting-style { .quota-tip:popover-open { opacity:0; transform:translateY(3px); } }
.quota-tip::after { content:""; position:absolute; left:var(--quota-tip-arrow, 14px); bottom:-5px; width:9px; height:9px; border-right:1px solid var(--ui-border-strong, var(--color-ui-border)); border-bottom:1px solid var(--ui-border-strong, var(--color-ui-border)); background:var(--color-base-100); transform:rotate(45deg); }
.quota-tip[data-side="below"]::after { top:-5px; bottom:auto; transform:rotate(225deg); }
.quota-tip[data-clipped] { overflow:auto; }
.quota-tip[data-clipped]::after { display:none; }
.quota-tip-head { font-weight:600; font-size:11.5px; color:var(--color-base-content); letter-spacing:.01em; }
.quota-tip-sub { font-size:10px; color:var(--color-base-content-faint, #888); margin-top:-2px; }
.quota-tip-row { min-width:0; white-space:normal; }
.quota-tip-row:has(.quota-tip-name) { display:grid; grid-template-columns:7px max-content minmax(0, 1fr); align-items:baseline; gap:2px 6px; }
.quota-tip-row > span { min-width:0; }
.quota-tip-dot { flex:none; width:7px; height:7px; border-radius:50%; background:currentColor; }
.quota-tip-name { flex:none; min-width:2.6rem; color:var(--color-base-content); font-weight:500; }
.quota-tip-reset { grid-column:2 / -1; color:var(--color-base-content-faint, #888); font-variant-numeric:tabular-nums; }
.project-all-chats { display:flex; align-items:center; gap:9px; padding:9px; margin-bottom:8px; text-align:left; border-radius:6px; }
#project-tabs-host { flex-shrink:0; min-width:0; }
/* Open chats wrap in reading order; do not clip fixed action menus or keyboard focus. */
.project-tabs { display:flex; align-items:flex-start; gap:6px; min-height:44px; padding:6px; border-bottom:1px solid var(--color-ui-border); background:var(--color-base-200); }
.project-tab-list { display:flex; flex:1; flex-wrap:wrap; align-items:stretch; align-content:flex-start; gap:4px; min-width:0; overflow:visible; }
.project-tab { display:flex; align-items:center; flex:1 1 180px; max-width:min(100%,260px); min-width:0; min-height:34px; border:1px solid var(--color-ui-border); border-radius:6px; color:var(--color-muted); }
.project-tab:hover { background:var(--color-base-300); }
.project-tab.selected { background:var(--color-base-100); color:var(--color-base-content); box-shadow:inset 0 -2px var(--color-primary); }
.project-tab-link { display:flex; align-items:center; gap:6px; flex:1; align-self:stretch; padding:6px 8px; min-width:0; font-size:12px; text-decoration:none; }
.project-tab-link .project-title { flex:1; }
.project-tab-menu { flex-shrink:0; }
.project-icon-button { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; flex-shrink:0; border-radius:5px; color:var(--color-muted); font-size:16px; cursor:pointer; list-style:none; }
.project-icon-button::-webkit-details-marker { display:none; }
.project-tab .project-icon-button { width:24px; height:24px; font-size:14px; }
.project-tab-tools { display:flex; flex-shrink:0; align-items:center; align-self:flex-start; gap:3px; min-height:34px; margin-left:auto; }
.project-menu { position:fixed; z-index:90; padding:4px; border-radius:8px; }
.project-menu-item { display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:4px; font-size:12px; }
.project-manage-trigger { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:34px; padding:6px 12px; margin-left:5px; border:1px solid var(--color-ui-border); border-radius:7px; background:var(--color-base-100); font-size:12px; font-weight:600; white-space:nowrap; }
.project-manage-trigger > i { font-size:18px; }
.project-new-chat { min-height:34px; min-width:34px; }
.project-panel-dialog { position:fixed; inset:var(--project-panel-top, 4rem) var(--project-panel-right, 1rem) auto auto; margin:0; width:min(24rem, calc(100vw - 2rem)); max-width:none; max-height:calc(100dvh - var(--project-panel-top, 4rem) - 1rem); padding:10px; border:1px solid var(--color-ui-border); border-radius:16px; color:var(--color-base-content); background:var(--color-base-100); box-shadow:0 16px 56px rgb(0 0 0 / .18); overflow:auto; overscroll-behavior:contain; }
.project-panel-dialog::backdrop { background:rgb(0 0 0 / .18); }
.project-panel-back, .project-page-backbar { display:none; }
.project-panel-heading { display:flex; align-items:center; gap:12px; padding:6px 6px 12px; }
.project-panel-heading > div { flex:1; min-width:0; }
.project-panel-heading h2 { font-size:16px; font-weight:650; overflow-wrap:anywhere; }
.project-panel-heading p { font-size:12px; color:var(--color-muted); margin-top:3px; }
.project-panel-close, .project-mobile-close { display:inline-flex; flex:none; align-items:center; justify-content:center; width:44px; height:44px; border-radius:8px; color:var(--color-muted); font-size:18px; }
.project-panel-workspace { display:grid; gap:6px; margin:0 6px 10px; padding:12px; border:1px solid var(--color-ui-border); border-radius:10px; background:var(--color-base-200); overflow-wrap:anywhere; font-size:11px; color:var(--color-muted); }
.project-panel-workspace strong { color:var(--color-base-content); font-size:10px; text-transform:uppercase; }
.project-panel-group { padding:6px 0; border-top:1px solid var(--color-ui-border); }
.project-panel-item { display:flex; align-items:center; gap:12px; width:100%; min-height:44px; padding:10px 12px; border-radius:8px; text-align:left; font-size:13px; }
.project-panel-item > i { flex:none; font-size:19px; color:var(--color-muted); }
.project-panel-item > span { flex:1; }
.project-panel-item > small { color:var(--color-muted); font-size:11px; }
.project-panel-help { padding:6px 12px 10px; font-size:11px; line-height:1.5; color:var(--color-muted); }
.project-panel-danger, .project-panel-danger > i { color:var(--color-error); }
.project-panel-dialog :is(a,button), #project-tabs-host :is(a,button,summary), #project-sidebar :is(a,button,summary), #project-confirm-dialog button { cursor:pointer; }
.project-panel-dialog :is(button,a)[disabled], #project-tabs-host :is(button,a)[disabled], #project-sidebar :is(button,a)[disabled], #project-confirm-dialog button:disabled { cursor:not-allowed; opacity:.5; }
.project-panel-dialog :is(button,a):hover, .project-manage-trigger:hover { background:var(--color-base-200); }
.project-panel-dialog :is(button,a):active { background:var(--color-base-300); }
.project-panel-dialog :is(button,a):focus-visible, [data-project-panel]:focus-visible { outline:2px solid var(--color-primary); outline-offset:-2px; }
.project-mobile-chat-row { display:flex; align-items:center; gap:4px; border-radius:8px; }
.project-mobile-chat { display:flex; flex:1; align-items:center; gap:8px; min-width:0; min-height:48px; padding:10px; border-radius:8px; font-size:14px; }
.project-mobile-chat .project-title { min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.project-mobile-chat .project-mobile-unread { flex-shrink:0; }
.project-mobile-chat[aria-current="page"] { background:var(--color-base-200); font-weight:600; }
.project-mobile-empty { padding:16px 12px; font-size:13px; color:var(--color-muted); }
#project-confirm-dialog button { min-height:44px; }
@media (max-width: 700px), (max-width: 1023px) and (pointer: coarse) {
  .project-panel-dialog { inset:auto env(safe-area-inset-right) max(env(safe-area-inset-bottom), calc(100dvh - var(--chat-viewport-top, 0px) - var(--chat-viewport-height, 100dvh))) env(safe-area-inset-left); width:auto; max-height:calc(var(--chat-viewport-height, 100dvh) - 1rem); padding:12px 10px max(12px, env(safe-area-inset-bottom)); border-radius:20px 20px 0 0; }
  .project-panel-dialog::backdrop { background:rgb(0 0 0 / .28); }
  .project-panel-heading { position:sticky; top:-12px; z-index:1; background:var(--color-base-100); }
  .project-panel-heading .project-panel-close { display:none; }
  .project-panel-back, .project-page-back { display:inline-flex; align-items:center; gap:6px; flex:none; min-height:44px; padding:8px; border-radius:8px; font-size:14px; cursor:pointer; color:var(--color-base-content); }
  .project-panel-back { margin-left:-4px; }
  .project-page-backbar { display:flex; position:sticky; top:0; z-index:35; flex:none; align-items:center; gap:12px; min-height:56px; padding:env(safe-area-inset-top) max(12px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left)); border-bottom:1px solid var(--color-ui-border); background:var(--color-base-100); }
  .project-page-backbar > span { min-width:0; font-size:14px; font-weight:600; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .project-page-back:hover { background:var(--color-base-200); }
  .project-page-back:focus-visible { outline:2px solid var(--color-primary); outline-offset:-2px; }
  body:has(#main [data-project-page]) #mobile-nav-button, #main:has([data-project-page]) > #project-tabs-host { display:none !important; }
  #main:has([data-project-page]) { padding-top:0 !important; }
  .project-panel-item { min-height:48px; }
}
#project-error { padding:10px 16px; background:var(--color-error); color:var(--color-error-content); }
.project-page { padding:28px; overflow:auto; }
.project-page h1 { font-size:22px; margin-bottom:8px; }
.project-chat-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 0; border-bottom:1px solid #8883; }
.project-chat-row a { flex:1; }
@media(max-width:767px) { .project-tabs { padding-top:44px; } }
/* Code has one shared surface on desktop and phone; lines never wrap implicitly. */
#messages .chat-code-block { min-width: 0; max-width: 100%; margin: .8rem 0; overflow: hidden; border: 1px solid var(--color-ui-border); border-radius: .8rem; background: var(--color-base-100); }
.chat-code-tools { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; padding: .3rem .5rem; border-bottom: 1px solid var(--color-ui-border); background: var(--color-base-200); font-size: .75rem; }
.chat-code-language { flex: 1; min-width: 3rem; font-family: var(--font-mono); color: var(--color-muted); }
.chat-code-tools button, .chat-code-feedback button { min-height: 36px; padding: .35rem .65rem; border-radius: .5rem; color: var(--color-base-content); }
.chat-code-tools button:hover, .chat-code-feedback button:hover { background: var(--color-base-300); }
.chat-code-tools [data-code-copy] { display: inline-grid; place-items: center; cursor: pointer; }
.chat-code-copy-label, .chat-code-copy-check { grid-area: 1 / 1; transition: opacity 140ms ease, transform 140ms ease; }
.chat-code-copy-label { opacity: 1; }
.chat-code-copy-check { display: flex; align-items: center; justify-content: center; opacity: 0; transform: scale(.8); color: var(--color-success); }
.chat-code-copy-check svg { width: 18px; height: 18px; }
[data-code-copy][data-copied="true"] .chat-code-copy-label { opacity: 0; }
[data-code-copy][data-copied="true"] .chat-code-copy-check { opacity: 1; transform: scale(1); }
.chat-code-status { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: reduce) { .chat-code-copy-label, .chat-code-copy-check { transition: none; } }
#messages .assistant .chat-code-block pre { margin: 0; padding: .85rem 1rem; min-width: 0; max-width: 100%; overflow: auto; overscroll-behavior-x: contain; white-space: pre; overflow-wrap: normal; word-break: normal; font-size: 13px; line-height: 1.6; border-radius: 0; }
#messages .assistant .chat-code-block code { white-space: pre; overflow-wrap: normal; word-break: normal; font-size: inherit; line-height: inherit; }
#messages .chat-code-block[data-code-collapsed="true"] pre { max-height: 24rem; }
.chat-code-feedback { color: var(--color-muted); font-size: .75rem; }
.chat-code-feedback:has(:not([hidden])) { padding-inline: .65rem; }
@media (max-width: 700px), (max-width: 1023px) and (pointer: coarse) {
  .chat-code-tools button, .chat-code-feedback button { min-height: 44px; }
  #messages .chat-code-block[data-code-collapsed="true"] pre { max-height: 18rem; }
}

/* Direct manipulation: immediate press, short interruptible release; no transcript-wide motion. */
:where(#chat-panel, #project-tabs-host, #nav-overlay, #app-popup, [data-mobile-inspector-dialog], .mobile-usage-dialog, .home-dashboard) :is(button, a[href], summary, [role="button"], .tool), #mobile-nav-button {
  -webkit-tap-highlight-color: transparent;
  transition: scale 180ms cubic-bezier(.2,.8,.2,1), filter 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
}
[data-ui-pressed] {
  scale: .96;
  filter: brightness(.92);
  box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--color-primary) 12%, transparent);
  transition-duration: 0ms !important;
}
:is(.nav-row, .project-mobile-chat, .project-mobile-name, .project-tab-link, .mobile-usage-strip, .home-dashboard a)[data-ui-pressed] { scale: .99; }
/* The editor acknowledges touch before the native keyboard finishes opening. */
#chat-panel .chat-composer .chat-box { transition: border-color 160ms ease, box-shadow 180ms ease, background-color 180ms ease; }
#chat-panel .chat-composer .chat-box:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 40%, transparent);
}
#chat-panel .chat-composer .chat-box[data-ui-pressed] {
  scale: none; filter: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 35%, transparent);
  background-color: color-mix(in srgb, var(--color-primary) 6%, var(--color-base-200)) !important;
}
#chat-panel[data-chat-editing] .chat-composer .chat-box {
  border-color: var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary) 5%, var(--color-base-200)) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 40%, transparent);
  animation: composer-edit-ready 260ms cubic-bezier(.2,.8,.2,1);
}
@keyframes composer-edit-ready {
  from { box-shadow: 0 0 0 5px color-mix(in srgb, var(--color-primary) 16%, transparent); }
  to { box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 40%, transparent); }
}
#chat-panel .tool[data-ui-pressed], #mobile-nav-button[data-ui-pressed] { transform: none; }
#mobile-nav-button[data-ui-pressed] {
  scale: .9;
  background-color: color-mix(in srgb, var(--color-primary) 18%, var(--color-base-100));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 25%, transparent);
}
@media (hover: hover) and (pointer: fine) { #chat-panel .tool.tool-tucked:hover:not([data-ui-pressed]) { transform: none; } }
@media (hover: none) { #chat-panel .tool.tool-tucked:hover { transform: none; } }
:where(#chat-panel, #project-tabs-host, #nav-overlay, #app-popup, [data-mobile-inspector-dialog], .mobile-usage-dialog, .home-dashboard) :is(button, a[href], summary, [role="button"]):focus-visible, #mobile-nav-button:focus-visible {
  outline: 2px solid var(--color-primary); outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  :where(#chat-panel, #project-tabs-host, #nav-overlay, #app-popup, [data-mobile-inspector-dialog], .mobile-usage-dialog, .home-dashboard) :is(button, a[href], summary, [role="button"], .tool), #mobile-nav-button { transition: none; }
  #chat-panel .chat-composer .chat-box { transition: none; }
  #chat-panel[data-chat-editing] .chat-composer .chat-box { animation: none; }
  [data-ui-pressed] { scale: none !important; transform: none !important; }
  #chat-panel .tool.tool-tucked:hover, #mobile-nav-button:active { transform: none; }
}
</style>
</head>
<body class="bg-base-200 text-base-content text-sm h-screen${embedded ? " overflow-hidden" : ""}"${currentId ? ` data-agent-id="${esc(currentId)}"` : ""}${sidebar ? ' data-presentation="sidebar"' : ""}>
<div id="frame" class="relative flex h-screen">
  ${hideNavigation ? "" : ctx.fns.procs.ui.button({ action: "open-global-menu-mobile", html: '<i class="ph ph-squares-four text-xl" aria-hidden="true"></i>', appearance: "plain", title: "Agents and pages", ariaLabel: "Open agents and pages", class: "hidden", attrs: { id: "mobile-nav-button", onclick: "window.__navOpen?.()" } })}
  ${hideNavigation ? "" : await ctx.fns.dock.render({})}
    <script src="/canvas/canvas.js" defer></script>
  <!-- This container owns no navigation attributes: live descendants must
       always target themselves, while navigation is handled by the global menu. -->
  <section id="page-view" class="flex min-w-0 flex-1 flex-col bg-base-100">
    <main id="main" hx-history-elt class="min-h-0 min-w-0 flex flex-1 flex-col overflow-y-auto">${opts.main}</main>
  </section>
  ${hideNavigation ? '' : '<aside id="dock-limits-shelf" aria-label="Лимиты моделей"></aside>'}
</div>
${embedded ? "" : `<dialog id="app-popup" class="m-auto max-h-[85vh] w-[min(48rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-ui-border bg-base-100 p-0 text-base-content shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[1px]">
  <div class="flex max-h-[85vh] flex-col">
    <div class="flex shrink-0 items-center gap-3 border-b border-ui-border px-5 py-3.5"><h2 id="app-popup-title" class="min-w-0 flex-1 truncate text-sm font-semibold text-muted">Details</h2>${ctx.fns.procs.ui.button({ action: "close-popup", html: '<i class="ph ph-x text-lg"></i>', appearance: "plain", title: "Close", ariaLabel: "Close", class: "flex size-8 items-center justify-center rounded-full text-faint hover:bg-base-200 hover:text-base-content", attrs: { id: "app-popup-close" } })}</div>
    <div id="app-popup-body" class="app-popup-body min-h-0 flex-1 overflow-auto bg-base-200/60 p-5 text-xs text-muted"></div>
    <footer data-tool-popup-footer><button type="button" data-tool-popup-close aria-label="Закрыть окно инструмента">Закрыть</button></footer>
  </div>
</dialog>
${hideNavigation ? "" : ctx.fns.ui.navMenu({})}`}
${ctx.fns.procs.ui.button({ action: "secure-input", appearance: "plain", ariaLabel: "Secure input", class: "hidden", attrs: { id: "secure-input-host", "hx-popup": "secureInput.current", "data-pending": (ctx.state as any).secureInput?.prompts?.size ? '1' : '0' } })}

${embedded ? `<script>document.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();window.parent.postMessage({type:'ui.close-popup'},location.origin)}})</script>` : `<script>window.addEventListener('message',function(event){if(event.origin!==location.origin||event.data?.type!=='ui.close-popup')return;var dialog=document.getElementById('app-popup');if(dialog?.open)dialog.close()})</script>`}

</body>
</html>`;
}
