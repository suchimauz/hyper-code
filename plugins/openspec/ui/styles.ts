/** Scoped OpenSpec Canvas styles: host theme tokens, light/dark fallbacks, container-query layout, reduced motion. */
export const styles = `
.osv{
 --osv-ease:cubic-bezier(.32,.72,0,1);
 --osv-spring:linear(0,.009,.035 2.1%,.141 4.4%,.281 6.7%,.723 12.9%,.938 16.7%,1.017 19.4%,1.077,1.121 24.7%,1.137 26.4%,1.14 28.2%,1.122 31.6%,1.024 39.6%,1.001 43.4%,.988 47.7%,.998 61.7%,1);
 --osv-radius:12px;
 --osv-card:var(--surface,light-dark(#fff,#212121));
 --osv-soft:color-mix(in srgb,var(--text,#161616) 4%,transparent);
 --osv-accent:var(--accent,#d97757);
 container-type:inline-size;container-name:osv;display:flex;flex-direction:column;height:100%;min-height:0;
 color:var(--text,light-dark(#161616,#fdfdfd));background:var(--bg,light-dark(#fff,#191919));
 font-family:var(--font-sans,system-ui,-apple-system,sans-serif);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;
}
.osv[data-theme=light]{color-scheme:light}.osv[data-theme=dark]{color-scheme:dark}
.osv *{box-sizing:border-box}
.osv button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.osv button:active:not(:disabled){transform:scale(.97);transition-duration:.08s}
.osv :focus-visible{outline:2px solid var(--focus-ring,var(--osv-accent));outline-offset:2px}
.osv-icon{flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

/* top bar */
.osv-bar{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:12px;padding:10px 14px;
 background:color-mix(in srgb,var(--bg,Canvas) 78%,transparent);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);
 border-bottom:1px solid var(--line,light-dark(#e9e9e9,#2c2c2c))}
.osv-title{display:flex;align-items:baseline;gap:8px;min-width:0;margin-right:auto}
.osv-title h2{margin:0;font-size:14px;font-weight:650;letter-spacing:-.01em}
.osv-title span{color:var(--text-tertiary,#91888a);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.osv-seg{position:relative;display:grid;grid-template-columns:repeat(var(--n),1fr);padding:3px;border-radius:10px;background:var(--osv-soft);isolation:isolate}
.osv-seg-thumb{position:absolute;z-index:-1;top:3px;bottom:3px;left:3px;width:calc((100% - 6px) / var(--n));border-radius:7px;
 background:var(--surface-raised,light-dark(#fff,#2f2f2f));box-shadow:0 1px 2px rgba(0,0,0,.08),0 2px 8px rgba(0,0,0,.06);
 transform:translateX(calc(100% * var(--i)));transition:transform .45s var(--osv-spring)}
.osv-seg button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;background:transparent;padding:4px 12px;border-radius:7px;
 color:var(--text-secondary,#70686a);font-weight:500;white-space:nowrap;transition:color .2s var(--osv-ease),transform .2s var(--osv-ease)}
.osv-seg button[aria-selected=true]{color:var(--text,inherit)}
.osv-count{min-width:18px;padding:0 5px;border-radius:999px;background:var(--osv-soft);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;color:var(--text-tertiary,#91888a)}
.osv-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line-strong,light-dark(#dedede,#3a3a3a));background:var(--osv-card);
 padding:5px 12px;border-radius:9px;font-weight:500;transition:background-color .2s var(--osv-ease),transform .2s var(--osv-ease),box-shadow .2s var(--osv-ease)}
.osv-btn:hover:not(:disabled){background:var(--hover-solid,var(--hover))}
.osv-btn:disabled{opacity:.55;cursor:default}
.osv-primary{background:var(--text,#161616);color:var(--bg,#fff)!important;border-color:transparent}
.osv-primary:hover:not(:disabled){background:color-mix(in srgb,var(--text,#161616) 85%,var(--bg,#fff))}
.osv-icon-btn{display:inline-grid;place-items:center;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--text-secondary,inherit);transition:background-color .2s var(--osv-ease),transform .2s var(--osv-ease)}
.osv-icon-btn:hover{background:var(--hover,rgba(0,0,0,.06));color:var(--text,inherit)}
.osv-spin{width:12px;height:12px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:osv-spin .7s linear infinite;display:inline-block}
@keyframes osv-spin{to{transform:rotate(360deg)}}

/* banners */
.osv-alert{display:flex;align-items:center;gap:8px;margin:10px 14px 0;padding:9px 12px;border-radius:10px;
 background:color-mix(in srgb,var(--tool-error,#ec1313) 9%,transparent);color:var(--tool-error,#ec1313);animation:osv-in .35s var(--osv-ease)}
.osv-status:empty{display:none}
.osv-valid{margin:10px 14px 0;padding:10px 12px;border-radius:var(--osv-radius);border:1px solid color-mix(in srgb,var(--tool-error,#ec1313) 25%,transparent);
 background:color-mix(in srgb,var(--tool-error,#ec1313) 5%,var(--osv-card));max-height:40cqh;overflow:auto;animation:osv-in .4s var(--osv-spring)}
.osv-valid[data-ok=true]{border-color:color-mix(in srgb,var(--success,#26713d) 30%,transparent);background:var(--success-soft,color-mix(in srgb,var(--success,#26713d) 8%,transparent))}
.osv-valid-head{display:flex;align-items:center;gap:8px;font-weight:500}
.osv-valid-head>span:nth-child(2){flex:1}
.osv-valid-dot{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;color:var(--bg,#fff);background:var(--tool-error,#ec1313)}
.osv-valid[data-ok=true] .osv-valid-dot{background:var(--success,#26713d)}
.osv-valid ul{margin:8px 0 0;padding-left:20px}.osv-valid li{margin:3px 0}
.osv-valid code{margin-left:6px;font-family:var(--font-mono,ui-monospace,monospace);font-size:11px;color:var(--text-tertiary,#91888a)}
.osv-level{display:inline-block;padding:0 6px;border-radius:5px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;background:var(--osv-soft)}
.osv-level[data-level=error]{color:var(--tool-error,#ec1313)}.osv-level[data-level=warning]{color:var(--tool-stopped,#dd8629)}

/* layout */
.osv-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(230px,300px) minmax(0,1fr)}
.osv-list{overflow:auto;padding:10px;border-right:1px solid var(--line,light-dark(#e9e9e9,#2c2c2c));background:color-mix(in srgb,var(--sidebar,var(--bg)) 60%,var(--bg))}
.osv-list [role=listbox]{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.osv-opt{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;cursor:pointer;
 transition:background-color .2s var(--osv-ease),transform .2s var(--osv-ease),box-shadow .2s var(--osv-ease)}
.osv-opt:hover{background:var(--hover,rgba(0,0,0,.05))}
.osv-opt:active{transform:scale(.985)}
.osv-opt[aria-selected=true]{background:var(--osv-card);box-shadow:0 0 0 1px var(--line,#e9e9e9),0 1px 3px rgba(0,0,0,.06)}
.osv-opt-text{display:flex;flex-direction:column;min-width:0}
.osv-opt strong{font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.osv-opt small,.osv-muted{color:var(--text-tertiary,#91888a);font-size:11.5px}
.osv-spec-icon{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--osv-soft);color:var(--text-secondary,inherit)}

/* progress ring */
.osv-ring{position:relative;flex:none;width:24px;height:24px;display:inline-grid;place-items:center}
.osv-ring svg{position:absolute;inset:0;transform:rotate(-90deg)}
.osv-ring circle{fill:none;stroke-width:2.5}
.osv-ring-track{stroke:var(--line-strong,#dedede)}
.osv-ring-fill{stroke:var(--osv-accent);stroke-linecap:round;transition:stroke-dashoffset .6s var(--osv-spring),stroke .3s}
.osv-ring[data-done=true]{background:var(--success,#26713d);border-radius:50%}
.osv-ring[data-done=true] .osv-ring-track,.osv-ring[data-done=true] .osv-ring-fill{stroke:transparent}
.osv-ring-check{transform:none!important;fill:none;stroke:var(--bg,#fff);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;animation:osv-pop .45s var(--osv-spring)}
.osv-ring-empty{border:2px dashed var(--line-strong,#dedede);border-radius:50%;width:20px;height:20px;margin:2px}

/* document */
.osv-doc{display:flex;flex-direction:column;overflow:auto;min-width:0;padding:18px 28px 40px}
.osv-doc-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.osv-doc-title{min-width:0;flex:1}
.osv-doc-title h3{margin:0;font-size:17px;font-weight:650;letter-spacing:-.015em;overflow-wrap:anywhere}
.osv-eyebrow{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-tertiary,#91888a)}
.osv-pill{flex:none;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:550;font-variant-numeric:tabular-nums;background:var(--accent-soft,#f6ded7);color:var(--accent-hover,#c46343)}
.osv-pill[data-done=true]{background:var(--success-soft,#e6f4e9);color:var(--success,#26713d)}
.osv-back{display:none}
.osv-arts{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
.osv-arts-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.osv-arts-label{font-size:11px;font-weight:600;color:var(--text-tertiary,#91888a);margin-right:2px}
.osv-arts button{border:1px solid var(--line,#e9e9e9);background:var(--osv-card);border-radius:999px;padding:3px 11px;font-size:12px;font-weight:500;color:var(--text-secondary,inherit);
 transition:background-color .2s var(--osv-ease),color .2s var(--osv-ease),border-color .2s var(--osv-ease),transform .2s var(--osv-ease)}
.osv-arts button:hover{border-color:var(--line-strong,#dedede);color:var(--text,inherit)}
.osv-arts button[aria-pressed=true]{background:var(--text,#161616);border-color:transparent;color:var(--bg,#fff)}
.osv-paper{flex:1;max-width:780px;width:100%}
.osv-md{overflow-wrap:anywhere;font-size:14px;line-height:1.65;animation:osv-in .35s var(--osv-ease)}
.osv-md>:first-child{margin-top:0}
.osv-md h1{font-size:24px;font-weight:700;letter-spacing:-.02em;line-height:1.2;margin:0 0 16px}
.osv-md h2{font-size:17px;font-weight:650;letter-spacing:-.01em;margin:28px 0 8px;padding-top:16px;border-top:1px solid var(--line,#e9e9e9)}
.osv-md h3{font-size:14.5px;font-weight:650;margin:20px 0 6px}
.osv-md h4{font-size:13px;font-weight:650;margin:16px 0 4px;color:var(--text-secondary,inherit)}
.osv-md h1+h2{border-top:0;padding-top:0;margin-top:8px}
.osv-md p{margin:0 0 10px}
.osv-md ul,.osv-md ol{padding-left:22px;margin:0 0 12px}.osv-md li{margin:3px 0}
.osv-md li::marker{color:var(--text-tertiary,#91888a)}
.osv-md .task-list-item{list-style:none;position:relative;margin-left:-22px;padding:6px 10px 6px 34px;border-radius:8px;transition:background-color .2s var(--osv-ease)}
.osv-md .task-list-item:hover{background:var(--osv-soft)}
.osv-md .task-list-item-checkbox{appearance:none;position:absolute;left:10px;top:9px;width:16px;height:16px;margin:0;border-radius:5px;border:1.5px solid var(--line-strong,#dedede);background:var(--osv-card)}
.osv-md .task-list-item-checkbox:checked{border-color:transparent;background:var(--success,#26713d)}
.osv-md .task-list-item:has(>.task-list-item-checkbox:checked)::after{content:'';position:absolute;left:10px;top:9px;width:16px;height:16px;pointer-events:none;background:var(--bg,#fff);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/14px no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/14px no-repeat;animation:osv-pop .35s var(--osv-spring)}
.osv-md .task-list-item:has(:checked){color:var(--text-secondary,#70686a)}
.osv-md code{font-family:var(--font-mono,ui-monospace,monospace);font-size:.86em;padding:1px 5px;border-radius:5px;background:var(--osv-soft)}
.osv-md pre{overflow:auto;padding:12px 14px;border-radius:10px;background:var(--osv-soft);border:1px solid var(--line,#e9e9e9)}
.osv-md pre code{padding:0;background:none}
.osv-md a{color:var(--link,var(--osv-accent));text-decoration:none}.osv-md a:hover{text-decoration:underline}
.osv-md blockquote{margin:0 0 12px;padding:2px 14px;border-left:3px solid var(--osv-accent);color:var(--text-secondary,inherit)}
.osv-md table{border-collapse:collapse;margin:0 0 12px;font-size:13px}.osv-md th,.osv-md td{padding:6px 10px;border-bottom:1px solid var(--line,#e9e9e9);text-align:left}
.osv-md strong{font-weight:650}

/* states */
.osv-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:40px 20px;text-align:center;color:var(--text-tertiary,#91888a)}
.osv-empty p{margin:0}
.osv-skeleton{display:flex;flex-direction:column;gap:12px;padding-top:6px}
.osv-skeleton span{height:12px;border-radius:6px;background:linear-gradient(90deg,var(--osv-soft) 25%,color-mix(in srgb,var(--text,#000) 9%,transparent) 50%,var(--osv-soft) 75%) 0 0/200% 100%;animation:osv-shimmer 1.4s linear infinite}
.osv-skeleton span:first-child{height:22px;width:45%}.osv-skeleton span:nth-child(3){width:85%}.osv-skeleton span:last-child{width:60%}
@keyframes osv-shimmer{to{background-position:-200% 0}}
@keyframes osv-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes osv-pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}

/* narrow */
@container osv (max-width:640px){
 .osv-bar{flex-wrap:wrap}
 .osv-title{flex-basis:100%}
 .osv-seg{flex:1}
 .osv-body{grid-template-columns:minmax(0,1fr)}
 .osv-list{border-right:0}
 .osv-body[data-open=true] .osv-list{display:none}
 .osv-body[data-open=false] .osv-doc{display:none}
 .osv-back{display:inline-grid}
 .osv-doc{padding:14px 16px 32px}
}
@media (prefers-reduced-motion:reduce){.osv *,.osv *::before,.osv *::after{transition:none!important;animation:none!important}}
`;
