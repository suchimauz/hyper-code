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
<style>
/* Compact lazy tool links. The tray is assembled client-side so consecutive
   calls occupy one visual row without wrapping each button in extra markup. */
.tool-tray { display: flex; flex-wrap: wrap; gap: .25rem; align-items: center; }
.inplace-popup-panel[id^="chat-panel-"] { width: min(30rem, calc(100vw - 1.5rem)); max-height: min(36rem, calc(100vh - 5rem)); overflow-y: auto; padding: .6rem; }
.chat-icon-ring { position: absolute; inset: -3px; border-radius: 9999px; pointer-events: none; background: conic-gradient(from 0deg, transparent 0 55%, var(--color-primary) 100%); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px)); mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px)); animation: chat-icon-spin 1.1s linear infinite; }
/* The header icon follows the live status region: ring on while it says running. */
.chat-icon-ring--live { display: none; }
.chat-header:has([data-agent-running]) .chat-icon-ring--live { display: block; }
@keyframes chat-icon-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .chat-icon-ring { animation: none; background: var(--color-primary); opacity: .45; } }
.chat-run-ring--live .chat-run-dots { transform-origin: 14px 14px; animation: chat-icon-spin 8s linear infinite; }
@media (prefers-reduced-motion: reduce) { .chat-run-ring--live .chat-run-dots { animation: none; } }
.inplace-popup-panel[id^="chat-panel-"] .chat-row { justify-content: flex-start; min-height: 1.85rem; }
.tool-tray-toggle { display: inline-flex; align-items: center; gap: .3rem; height: 1.5rem; padding: 0 .55rem; border: 1px solid var(--ui-border); border-radius: 9999px; background: rgb(from var(--color-base-100) r g b / .6); font-size: var(--text-2xs); color: var(--color-subtle); cursor: pointer; }
.tool-tray-toggle:hover { color: var(--color-base-content); border-color: var(--ui-border-strong); }
/* Folded: failures and the latest call stay on the row. The latest one is
   marked by the script rather than matched with :last-child, because the live
   region for the running call also sits in this row and would otherwise take
   that position — silently hiding the very call the folded row exists to show. */
.tool-tray--folded > .tool:not(.text-error):not(.tool-latest) { display: none; }
.tool.tool-tucked {
  width: 1.333rem; height: 1.333rem; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 9999px;
  background-color: rgb(from var(--color-base-200) r g b / .62);
  background-image: none;
  background-position: initial;
  background-size: initial;
  border: 1px solid color-mix(in oklab, var(--color-base-content) 14%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in oklab, white 65%, transparent), inset 0 -1px 2px color-mix(in oklab, var(--color-base-content) 10%, transparent), 0 1px 3px color-mix(in oklab, var(--color-base-content) 10%, transparent);
  backdrop-filter: blur(5px) saturate(135%);
  -webkit-backdrop-filter: blur(5px) saturate(135%);
}
.tool.tool-tucked > i { font-size: .7rem; filter: drop-shadow(0 1px 0 color-mix(in oklab, white 80%, transparent)); }
.tool { transition: background-color .2s ease, border-color .15s ease, box-shadow .15s ease, transform .15s ease; }
.tool.tool-tucked:hover {
  background-color: rgb(from var(--color-base-200) r g b / .76);
  background-image: none;
  border-color: color-mix(in oklab, var(--color-base-content) 20%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in oklab, white 75%, transparent), inset 0 -2px 3px color-mix(in oklab, var(--color-base-content) 12%, transparent), 0 4px 10px color-mix(in oklab, var(--color-base-content) 16%, transparent);
  transform: translateY(-2px) scale(1.15);
  color: var(--color-base-content);
}
.tool.tool-tucked:active { transform: translateY(0) scale(1.05); }
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
[data-mobile-message-actions], .mobile-code-tools { display: none; }
@media (max-width: 700px), (max-width: 1023px) and (pointer: coarse) {
  /* Actions get their own bottom row, outside flex layout. They must never
   * shrink or push a right-aligned user bubble away from its original edge. */
  #messages .mobile-message-enhanced { position: relative; min-width: 0; padding-bottom: 2.75rem; }
  #messages .mobile-message-enhanced > * { min-width: 0; }
  #messages .mobile-message-enhanced [data-action="delete-one"],
  #messages .mobile-message-enhanced [data-action="delete-from"] { display: none; }
  #messages [data-mobile-message-actions] {
    display: block; position: absolute; right: 0; bottom: 0; width: 44px; height: 44px; min-height: 44px;
    padding: 4px; border: 0; border-radius: 12px;
    font-size: 24px; background: transparent; color: var(--color-muted, #777);
  }
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
  .mobile-message-sheet {
    position: fixed; inset: auto 0 0; margin: 0; width: 100%; max-width: none;
    max-height: 80dvh; overflow-y: auto; box-sizing: border-box;
    padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
    border: 1px solid var(--color-base-300, #ccc); border-radius: 20px 20px 0 0;
    background: var(--color-base-100, #fff); color: var(--color-base-content, #222);
  }
  .mobile-message-sheet::backdrop { background: rgb(0 0 0 / .45); }
  .mobile-message-sheet h2 { margin: 0 0 12px; font-size: 18px; font-weight: 600; }
  .mobile-message-sheet button { display: block; width: 100%; min-height: 48px; margin: 8px 0; padding: 12px; text-align: left; border: 1px solid var(--color-ui-border, #ddd); border-radius: 12px; }
  .mobile-message-sheet button[data-danger] { color: var(--color-error, #b91c1c); }
  .mobile-code-tools { color: var(--color-muted, #777); }
  .mobile-message-sheet button:focus-visible, [data-mobile-message-actions]:focus-visible,
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

.agent-meta-panel { transition: width .18s ease, border-radius .18s ease; }
[data-mobile-inspector-open], [data-mobile-inspector-header] { display: none; }
.agent-meta-panel.agent-meta-collapsed { width: 2.5rem !important; min-width: 2.5rem; }
.agent-meta-panel.agent-meta-collapsed [data-agent-meta-content],
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
  #chat-panel > header [data-chat-buttons] > :not([data-chat-id="agent.effort"]) { display: none !important; }
}
@container chat (max-width: 420px) {
  #chat-panel > header [data-chat-buttons], #chat-panel > header [data-chat-badges] > :not([data-chat-id="agent.status"]) { display: none !important; }
}
.dot-grid-surface {
  background-color: var(--color-base-200);
  background-image: radial-gradient(circle, color-mix(in oklab, var(--color-base-content) 9%, transparent) 0 1px, transparent 1.35px);
  background-position: 8px 8px;
  background-size: 16px 16px;
  background-attachment: local;
}

.chat-dot-grid { padding-top: 4rem !important; padding-bottom: 6.5rem !important; }
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
  margin: -4.5rem auto .5rem;
  background: transparent;
  pointer-events: none;
}
.chat-composer > * { pointer-events: auto; }
.glass-input {
  min-height: 44px;
  max-height: 208px;
  background-color: rgb(from var(--color-base-100) r g b / .80) !important;
  box-shadow: 0 0 0 1px rgb(0 0 0 / .04), 0 2px 8px rgb(0 0 0 / .04), 0 4px 80px 8px rgb(0 0 0 / .024);
  backdrop-filter: blur(16px) saturate(115%);
  -webkit-backdrop-filter: blur(16px) saturate(115%);
}
.chat-box.glass-input { max-height: none; min-height: 0; }
.chat-box:focus-within { box-shadow: 0 0 0 2px rgb(59 130 246 / .55), 0 2px 10px rgb(0 0 0 / .055), 0 4px 80px 8px rgb(0 0 0 / .03); }
.chat-ring { display: block; width: 18px; height: 18px; border-radius: 9999px; background: conic-gradient(var(--c) var(--p), color-mix(in oklab, var(--color-base-content) 14%, transparent) 0); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); }
.glass-input:hover { box-shadow: 0 0 0 1px rgb(0 0 0 / .05), 0 2px 9px rgb(0 0 0 / .05), 0 4px 80px 8px rgb(0 0 0 / .028); }
.glass-input:focus {
  box-shadow: 0 0 0 3px rgb(59 130 246 / .72), 0 2px 10px rgb(0 0 0 / .055), 0 4px 80px 8px rgb(0 0 0 / .03);
}
.chat-composer kbd { font: inherit; color: color-mix(in oklab, var(--color-base-content) 55%, transparent); }


.chat-glass,
.chat-glass-primary {
  background-size: 16px 16px;
  background-position: 9px 9px;
  background-attachment: local;
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
.chat-glass {
  background-color: rgb(from var(--color-base-100) r g b / .86);
  background-image: radial-gradient(circle, color-mix(in oklab, var(--color-base-content) 5%, transparent) 0 1px, transparent 1.35px);
}
.chat-glass-primary {
  background-color: rgb(20 20 22 / .94);
  background-image: radial-gradient(circle, rgb(255 255 255 / .23) 0 1.1px, transparent 1.5px);
}

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
  #chat-panel [data-mobile-inspector-open][data-inspector-ready] { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 2.75rem; min-height: 2.75rem; border-radius: .65rem; color: var(--color-muted); font-size: 1.25rem; }
  [data-mobile-inspector-dialog] { position: fixed; inset: var(--chat-viewport-top, 0px) 0 auto; margin: 0; padding: 0; width: 100%; max-width: none; height: var(--chat-viewport-height, 100dvh); max-height: none; border: 0; border-radius: 0; overflow: hidden; color: var(--color-base-content); background: var(--color-base-100); }
  [data-mobile-inspector-dialog]::backdrop { background: var(--color-base-100); }
  [data-mobile-inspector-dialog] > .agent-meta-panel { display: flex !important; width: 100% !important; min-width: 0 !important; height: 100%; max-height: none; margin: 0; border: 0; border-radius: 0; box-shadow: none; transition: none; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); box-sizing: border-box; background: var(--color-base-100); }
  [data-mobile-inspector-dialog] [data-desktop-inspector-header] { display: none; }
  [data-mobile-inspector-dialog] [data-mobile-inspector-header] { display: flex; height: auto !important; min-height: 3.5rem; flex: none; align-items: center !important; justify-content: flex-start !important; gap: .75rem; padding: .25rem .75rem !important; border-bottom: 1px solid var(--color-ui-border) !important; }
  [data-mobile-inspector-header] > div { min-width: 0; }
  [data-mobile-inspector-header] h2 { margin: 0; font-size: 1.0625rem; font-weight: 600; }
  [data-mobile-inspector-header] p { margin: 0; font-size: .8125rem; color: var(--color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-mobile-inspector-close] { display: inline-flex; align-items: center; gap: .4rem; min-height: 2.75rem; flex: none; padding-inline: .35rem; font-size: 1rem; }
  [data-mobile-inspector-dialog] [data-agent-meta-content] { display: block !important; min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; font-size: 1rem; }
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
  .project-mobile-switcher { position: relative; flex: none; }
  .project-mobile-switcher > summary { display: flex; align-items: center; justify-content: center; gap: .35rem; min-height: 2.75rem; min-width: 2.75rem; padding-inline: .5rem; font-size: .8125rem; list-style: none; cursor: pointer; border-radius: .6rem; }
  .project-mobile-switcher > summary::-webkit-details-marker { display: none; }
  .project-mobile-switcher[open] > summary { background: var(--color-base-200); color: var(--color-base-content); }
  .project-mobile-menu { position: absolute; right: 0; top: 100%; z-index: 50; width: min(21rem, calc(100vw - 1.2rem - env(safe-area-inset-left) - env(safe-area-inset-right))); max-height: min(50dvh, calc(var(--chat-viewport-height, 100dvh) - 7rem)); overflow-y: auto; overscroll-behavior: contain; padding: .35rem; border: 1px solid var(--color-ui-border); border-radius: .85rem; background: var(--color-base-100); box-shadow: 0 8px 24px rgb(0 0 0 / .12); }
  .project-mobile-chat { display: flex; align-items: center; gap: .5rem; min-height: 2.75rem; padding: .65rem; border-radius: .5rem; font-size: 1rem; }
  .project-mobile-chat .project-title { min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .project-mobile-chat .project-mobile-unread { flex-shrink: 0; }
  .project-mobile-chat[aria-current="page"] { background: var(--color-base-200); color: var(--color-base-content); font-weight: 600; }
  .project-mobile-bar :is(a,summary):focus-visible { outline: 2px solid var(--color-base-content); outline-offset: -2px; }
  .project-mobile-bar :is(a,summary):active { background: var(--color-base-200); }
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
  #chat-panel > header button:not(.hidden), #chat-panel > header a:not(.hidden) { min-width: 2.75rem; min-height: 2.75rem; display: inline-flex; align-items: center; justify-content: center; }
  #chat-panel > header select { min-height: 2.75rem; }
  .chat-composer button { min-width: 2.75rem; min-height: 2.75rem; }

  #chat-panel > header [data-chat-buttons], #chat-panel > header [data-chat-badges] > :not([data-chat-id="agent.status"]) { display: none !important; }
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
  #chat-panel > header.glass-bar { position: relative; inset: auto; left: auto; right: auto; width: 100% !important; max-width: none !important; margin: 0 !important; height: auto; min-height: 3.5rem; flex-shrink: 0; padding-left: 3.5rem !important; padding-right: .5rem !important; border: 0; border-bottom: 1px solid var(--color-ui-border); border-radius: 0; background-color: var(--color-base-100) !important; background-image: none; backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: none; }
  #chat-panel > header [data-chat-part="icon"] { display: inline-flex !important; }
  #chat-panel > header [data-chat-avatar] { display: none; }
  #chat-panel > header [data-chat-model-mark] { display: inline-flex; align-items: center; justify-content: center; color: var(--color-muted); }
  #chat-panel [data-chat-model-mark] > span { color: inherit; }
  #chat-panel [data-chat-model-mark] svg { width: 1.125rem; height: 1.125rem; }
  #main:has(> #project-tabs-host .project-mobile-bar) #chat-panel > header.glass-bar { min-height: 2.75rem; padding-left: .5rem !important; }
  body:has(#main > #project-tabs-host .project-mobile-bar):has(#main > [data-page="agent"]) #mobile-nav-button { top: env(safe-area-inset-top); }
  #chat-panel > header > div:has([data-chat-part="name"]) { flex: 1; }
  body:has(#main > [data-page="agent"]) #mobile-nav-button { top: calc(env(safe-area-inset-top) + .35rem); border: 0; background: transparent; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
  #chat-panel [data-chat-part="name"] { display: block !important; min-width: 0 !important; font-family: inherit; font-size: 1.0625rem; font-weight: 600; line-height: 1.35; color: var(--color-base-content); }
  #chat-panel [data-chat-technical-id] { display: none; }
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
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
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
<script src="/ui/mobileMessage.js" defer></script>
<script src="/ui/chatSearch.js" defer></script>
<script src="/ui/quotaTip.js" defer></script>
<script src="/ui/mobileUsage.js" defer></script>
<script src="/ui/webPush.js" defer></script>
<script src="/screen/client.js" defer></script>
<script src="/ui/wake-timer.js" defer></script>
<script src="/ui/spin-sync.js" defer></script>
<script src="/ui/tool-timer.js" defer></script>
${hideNavigation ? "" : '<script src="/projects/navigation.js" defer></script>'}
<style>
/* Full-height shell navigation, using Hyper theme tokens and shared buttons. */
#dock { width:232px; height:100%; margin:0; padding:0 10px 10px; align-items:stretch; border-radius:0; background-color:color-mix(in srgb,var(--color-base-100) 97%,white); box-shadow:inset 0 1px 0 rgb(255 255 255 / .22); }
.project-shell-header { display:flex; align-items:center; justify-content:space-between; height:48px; flex-shrink:0; padding:0 12px; margin:0 -10px 6px; border-bottom:1px solid var(--ui-border-strong); }
.project-header-controls { display:flex; align-items:center; gap:6px; }
.project-header-controls>.dock-fixed { width:auto; }
.project-header-controls #hyper-update-badge { margin-top:0; }
#dock-running-agents { flex:0 0 auto; min-width:0; width:100%; margin:6px 0; }
.dock-running-list { display:flex; flex-wrap:wrap; align-items:center; align-content:flex-start; gap:6px; min-width:0; max-height:158px; overflow-x:hidden; overflow-y:auto; padding:6px; scrollbar-width:thin; }
.dock-running-list>a { display:flex; align-items:center; justify-content:center; flex:0 0 32px; width:32px; height:32px; padding:0; border-radius:6px; }
.dock-running-list>a:hover { background:var(--color-base-300); }
.project-sidebar { display:flex; flex:1; min-height:0; flex-direction:column; }
.project-heading { display:flex; align-items:center; justify-content:space-between; padding:8px 6px; font-size:12px; font-weight:500; }
.project-list { overflow:auto; min-height:0; }
.project-row { display:flex; align-items:center; gap:9px; min-height:36px; padding:7px 9px; border-radius:6px; margin:2px 0; font-size:13px; text-decoration:none; }
.project-title { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.project-row .project-title { flex:1; }
.project-row>i { flex-shrink:0; font-size:16px; }
.project-row:hover,.project-all-chats:hover,.project-icon-button:hover,.project-menu-item:hover { background:var(--color-base-300); }
.project-row.selected { background:var(--color-base-300); color:var(--color-base-content); }
.project-row:focus-visible,.project-icon-button:focus-visible,.project-tab-link:focus-visible { outline:2px solid var(--color-primary); outline-offset:-2px; }
.project-indicators { display:flex; align-items:center; gap:6px; flex-shrink:0; }
.project-running { display:inline-flex; font-size:15px; }
.project-unread { min-width:17px; height:17px; padding:0 4px; border-radius:9px; font-size:10px; line-height:17px; text-align:center; }
.project-unread-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
#dock-bottom>.dock-item { width:auto; }
#dock-bottom { flex-direction:row; flex-wrap:wrap; justify-content:flex-start; padding:8px 4px 0; border-top:1px solid var(--color-ui-border); }
#dock #quota-rings,#dock #llm-usage { width:100%; }
#dock #llm-usage { display:flex; align-items:flex-start; gap:4px; flex-wrap:wrap; }
#dock #llm-usage>[role="group"] { flex-direction:row; flex-wrap:wrap; justify-content:flex-start; gap:5px; border-top:0; padding-top:0; }
#dock #llm-usage>div:not([role="group"]) { padding-top:0; }
/* Quota ring hover card: the name, the limits and the reset moment — nothing else.
   It lives in the top layer (Popover API): the dock's backdrop-filter creates a
   stacking context, so no z-index inside the dock can lift anything above the
   chat column. The quotaTip script pins it to the ring with fixed coordinates. */
.quota-tip { position:fixed; inset:auto; margin:0; width:auto; height:auto; overflow:visible; display:flex; flex-direction:column; gap:3px; min-width:12.5rem; max-width:17rem; padding:.5rem .65rem .55rem; border:1px solid var(--ui-border-strong, var(--color-ui-border)); border-radius:.6rem; background:var(--color-base-100); box-shadow:0 10px 28px rgb(0 0 0 / .16), 0 2px 6px rgb(0 0 0 / .08); font-size:11px; line-height:1.45; color:var(--color-muted); pointer-events:none; opacity:1; transform:none; transition:opacity .12s ease, transform .12s ease, overlay .12s allow-discrete; }
/* Author styles outrank the UA sheet, so the closed state must be restated
   explicitly — otherwise every card is visible on load and hidePopover() has
   nothing to close. overflow:visible matters too: the UA popover default is
   overflow:auto, which turns the caret hanging 5px below the card into a
   scrollbar. */
.quota-tip:not(:popover-open) { display:none; }
@starting-style { .quota-tip:popover-open { opacity:0; transform:translateY(3px); } }
.quota-tip::after { content:""; position:absolute; left:14px; bottom:-5px; width:9px; height:9px; border-right:1px solid var(--ui-border-strong, var(--color-ui-border)); border-bottom:1px solid var(--ui-border-strong, var(--color-ui-border)); background:var(--color-base-100); transform:rotate(-45deg); }
.quota-tip-head { font-weight:600; font-size:11.5px; color:var(--color-base-content); letter-spacing:.01em; }
.quota-tip-sub { font-size:10px; color:var(--color-base-content-faint, #888); margin-top:-2px; }
.quota-tip-row { display:flex; align-items:center; gap:6px; white-space:nowrap; }
.quota-tip-dot { flex:none; width:7px; height:7px; border-radius:50%; background:currentColor; }
.quota-tip-name { flex:none; min-width:2.6rem; color:var(--color-base-content); font-weight:500; }
.quota-tip-reset { margin-left:auto; padding-left:10px; color:var(--color-base-content-faint, #888); font-variant-numeric:tabular-nums; }
.project-all-chats { display:flex; align-items:center; gap:9px; padding:9px; margin-bottom:8px; text-align:left; border-radius:6px; }
#project-tabs-host { flex-shrink:0; min-width:0; }
.project-tabs { display:flex; align-items:stretch; min-height:44px; border-bottom:1px solid var(--color-ui-border); background:var(--color-base-200); }
.project-tab-list { display:flex; align-items:stretch; overflow-x:auto; min-width:0; scrollbar-width:thin; }
.project-tab { display:flex; align-items:center; flex-shrink:0; max-width:260px; min-width:100px; border-right:1px solid var(--color-ui-border); color:var(--color-muted); }
.project-tab.selected { background:var(--color-base-100); color:var(--color-base-content); box-shadow:inset 0 -2px var(--color-primary); }
.project-tab-link { display:flex; align-items:center; gap:7px; flex:1; padding:10px; min-width:0; font-size:12px; text-decoration:none; }
.project-icon-button { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; flex-shrink:0; border-radius:5px; color:var(--color-muted); font-size:16px; cursor:pointer; list-style:none; }
.project-icon-button::-webkit-details-marker { display:none; }
.project-tab .project-icon-button { width:24px; height:24px; font-size:14px; }
.project-tab-tools { display:flex; align-items:center; gap:3px; padding:6px; margin-left:auto; }
.project-menu { position:fixed; z-index:90; padding:4px; border-radius:8px; }
.project-menu-item { display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:4px; font-size:12px; }
#project-error { padding:10px 16px; background:var(--color-error); color:var(--color-error-content); }
.project-page { padding:28px; overflow:auto; }
.project-page h1 { font-size:22px; margin-bottom:8px; }
.project-chat-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 0; border-bottom:1px solid #8883; }
.project-chat-row a { flex:1; }
@media(max-width:767px) { .project-tabs { padding-top:44px; } }
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
@media (hover: hover) and (pointer: fine) { #chat-panel .tool.tool-tucked:hover:not([data-ui-pressed]) { transform: translateY(-1px); } }
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
