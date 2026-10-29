// Intent-based, short-lived HTML speculation. HTMX remains the only owner of
// swaps, history, OOB chrome and client boot. No rendered DOM/drafts in the cache.
(() => {
  if (window.hyperNavigation) return;
  const TTL = 5000, LIMIT = 6, MAX_BYTES = 1500000;
  const cache = new Map(), queue = [];
  let running = 0, sequence = 0, active = null, idle = 0, generation = 0, veil = null, veilTimer = null;
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const allowed = value => {
    try {
      const url = new URL(value, location.href);
      if (url.origin !== location.origin || url.username || url.password || url.hash) return null;
      if (!/^\/(agent\/[A-Za-z0-9_-]+|projects\/(view|archive)|llms)\/?$/.test(url.pathname) || /^\/agent\/new\/?$/.test(url.pathname)) return null;
      const keys = url.pathname.startsWith('/projects/') ? ['projectId','list','archive'] : url.pathname.startsWith('/llms') ? ['provider'] : [];
      if ([...url.searchParams.keys()].some(key => !keys.includes(key))) return null;
      if (/^\/projects\/view\/?$/.test(url.pathname) && !url.searchParams.get('projectId')?.trim()) return null;
      return url.pathname + url.search;
    } catch { return null; }
  };
  const affordable = () => !document.hidden && navigator.onLine !== false && !navigator.connection?.saveData && !/^(slow-)?2g$/.test(navigator.connection?.effectiveType || '');
  const headers = () => ({'HX-Request':'true','HX-Request-Type':'partial','HX-Target':'main#main','HX-Current-URL':location.href,'X-Hyper-Prefetch':'1',Accept:'text/html'});
  const redirect = response => {
    const raw = response.headers.get('HX-Location');
    if (!raw) return null;
    try { return allowed(raw.startsWith('{') ? JSON.parse(raw).path : raw); } catch { return null; }
  };
  const remove = (url, entry) => { if (cache.get(url) === entry) cache.delete(url); entry.controller.abort(); };
  const invalidate = () => { generation++; for (const [url, entry] of cache) remove(url, entry); };
  async function drain() {
    while (running < 2 && queue.length) {
      const entry = queue.shift();
      if (entry.controller.signal.aborted || !affordable()) { remove(entry.url, entry); entry.resolve(null); continue; }
      running++;
      void (async () => {
        const timer = setTimeout(() => entry.controller.abort(), 8000);
        try {
          const response = await fetch(entry.url, {headers:headers(),credentials:'same-origin',cache:'no-store',redirect:'error',signal:entry.controller.signal});
          if (!response.ok || response.headers.has('HX-Redirect') || response.headers.has('HX-Refresh')) throw new Error('Not a reusable page');
          const next = redirect(response);
          if (response.headers.has('HX-Location') && !next) throw new Error('Unsafe redirect');
          if (!next && !response.headers.get('Content-Type')?.includes('text/html')) throw new Error('Not HTML');
          if (Number(response.headers.get('Content-Length')) > MAX_BYTES) throw new Error('Page too large');
          const text = await response.text();
          if (text.length > MAX_BYTES || entry.controller.signal.aborted) throw new Error('Expired page');
          // Never speculate live answer/approval forms or a full login document.
          if (/data-input-state=["'](?:open|processing)["']|<html[\s>]|<form[^>]+(?:login|sign-in)/i.test(text)) throw new Error('Interactive or full page');
          entry.response = new Response(text, {status:response.status,headers:response.headers});
          entry.expires = Date.now() + TTL;
          entry.resolve(entry);
          if (next) void preload(next);
        } catch { remove(entry.url, entry); entry.resolve(null); }
        finally { clearTimeout(timer); running--; void drain(); }
      })();
    }
  }
  function preload(value) {
    const url = allowed(value);
    if (!url || !affordable() || url === location.pathname + location.search) return Promise.resolve(null);
    const previous = cache.get(url);
    if (previous && Date.now() < previous.expires) return previous.promise;
    if (previous) remove(url, previous);
    while (cache.size >= LIMIT) { const [key, entry] = cache.entries().next().value; remove(key, entry); }
    const entry = {url,controller:new AbortController(),expires:Date.now()+TTL,response:null,resolve:null,promise:null};
    entry.promise = new Promise(resolve => { entry.resolve = resolve; });
    cache.set(url, entry); queue.push(entry); void drain();
    return entry.promise;
  }
  function releaseOverlay(overlay) {
    if (!overlay) return;
    overlay.removeAttribute('data-navigation-loading');
    overlay.setAttribute('data-navigation-leaving','');
    overlay.setAttribute('aria-hidden','true');
    overlay.setAttribute('inert','');
    clearTimeout(veilTimer);
    const remove = () => { overlay.remove(); if (veil === overlay) veil=null; };
    if (reducedMotion()) remove();
    else veilTimer=setTimeout(remove,180);
  }
  function restore(ticket, keepOverlay = false) {
    if (!ticket) return;
    clearTimeout(ticket.timeout); ticket.unwatch?.();
    if (!keepOverlay) releaseOverlay(ticket.overlay);
    for (const [node, inert] of ticket.children || []) {
      node.removeAttribute('data-navigation-obscured');
      if (!inert) node.removeAttribute('inert');
    }
    ticket.main?.removeAttribute('aria-busy');
    ticket.main?.removeAttribute('data-navigation-pending');
    document.querySelectorAll('[data-navigation-destination]').forEach(el => el.removeAttribute('data-navigation-destination'));
  }
  function cancel() {
    const previous = active; active = null;
    const returnFocus = previous?.overlay?.contains(document.activeElement);
    previous?.ctx?.request?.abort?.(); restore(previous);
    if (returnFocus && previous?.focus?.isConnected) previous.focus.focus({preventScroll:true});
  }
  function prepare(value, label) {
    const url = allowed(value);
    if (!url) return null;
    if (active?.url === url && !active.ctx) return active;
    // Keep the same visual layer through rapid clicks and redirect chains: no
    // hide/show flash, focus round-trip or minimum artificial loading delay.
    const previous=active; active=null;
    previous?.ctx?.request?.abort?.(); restore(previous,true);
    document.getElementById('navigation-error')?.remove();
    const main = document.getElementById('main');
    const ticket = {url,id:++sequence,main,children:[],focus:previous?.focus || document.activeElement,ctx:null,overlay:null,timeout:null,unwatch:null};
    active = ticket;
    if (!main) { releaseOverlay(veil); return ticket; }
    let overlay=veil;
    if (!overlay) {
      overlay=document.createElement('section'); overlay.className='navigation-loading-layer';
      const content=document.createElement('div'); content.className='navigation-loading-content';
      const status=document.createElement('div'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); status.setAttribute('aria-atomic','true');
      const spinner=document.createElement('span'); spinner.className='navigation-spinner'; spinner.setAttribute('aria-hidden','true');
      const title=document.createElement('h2');
      const message=document.createElement('p'); message.textContent='Загрузка…';
      status.append(spinner,title,message);
      const back=document.createElement('button'); back.type='button'; back.className='navigation-cancel'; back.textContent='Отменить переход'; back.addEventListener('click',cancel);
      content.append(status,back); overlay.append(content); veil=overlay;
    }
    clearTimeout(veilTimer);
    overlay.removeAttribute('data-navigation-leaving'); overlay.removeAttribute('aria-hidden'); overlay.removeAttribute('inert');
    overlay.dataset.navigationLoading='';
    overlay.querySelector('h2').textContent=label?.trim().slice(0,120) || (url.startsWith('/llms') ? 'Модели и лимиты' : url.startsWith('/projects') ? 'Проект' : 'Чат');
    for (const child of main.children) {
      // Tabs must stay usable for rapid A → B → C, even while content is loading.
      if (child.id === 'project-tabs-host') continue;
      ticket.children.push([child,child.hasAttribute('inert')]);
      child.setAttribute('inert',''); child.setAttribute('data-navigation-obscured','');
    }
    main.setAttribute('aria-busy','true'); main.setAttribute('data-navigation-pending','');
    ticket.overlay=overlay;
    // A viewport-clipped fixed layer never changes the page's scroll height and
    // survives the HTMX swap. Reposition for scrolling, resizing and the keyboard.
    const position=()=>{
      const rect=main.getBoundingClientRect(), viewport=window.visualViewport;
      const left=Math.max(rect.left,viewport?.offsetLeft || 0), right=Math.min(rect.right,(viewport?.offsetLeft || 0)+(viewport?.width || innerWidth));
      const tabs=main.querySelector('#project-tabs-host')?.getBoundingClientRect();
      const top=Math.min(rect.bottom,Math.max(rect.top,viewport?.offsetTop || 0,tabs?.height ? tabs.bottom : rect.top));
      const bottom=Math.min(rect.bottom,(viewport?.offsetTop || 0)+(viewport?.height || innerHeight));
      Object.assign(overlay.style,{left:`${left}px`,top:`${top}px`,width:`${Math.max(0,right-left)}px`,height:`${Math.max(0,bottom-top)}px`});
    };
    position(); if (!overlay.isConnected) document.body.append(overlay);
    const observer=window.ResizeObserver ? new ResizeObserver(position) : null;
    observer?.observe(main); const tabs=main.querySelector('#project-tabs-host'); if(tabs) observer?.observe(tabs);
    window.addEventListener('resize',position); main.addEventListener('scroll',position,{passive:true});
    window.visualViewport?.addEventListener('resize',position); window.visualViewport?.addEventListener('scroll',position);
    ticket.unwatch=()=>{ observer?.disconnect(); window.removeEventListener('resize',position); main.removeEventListener('scroll',position); window.visualViewport?.removeEventListener('resize',position); window.visualViewport?.removeEventListener('scroll',position); };
    ticket.position=position;
    if (ticket.children.some(([node]) => node.contains(document.activeElement))) overlay.querySelector('button').focus({preventScroll:true});
    document.querySelectorAll('a[href]').forEach(link => { if (allowed(link.href) === url) link.setAttribute('data-navigation-destination',''); });
    ticket.timeout = setTimeout(() => fail(ticket), 20000);
    return ticket;
  }
  function fail(ticket) {
    if (active !== ticket) return;
    cancel();
    const box = document.createElement('div'); box.id='navigation-error'; box.setAttribute('role','alert');
    box.textContent='Не удалось загрузить страницу. Текущая страница и черновик сохранены. ';
    const retry = document.createElement('a'); retry.href=ticket.url; retry.textContent='Повторить';
    retry.setAttribute('hx-get',ticket.url); retry.setAttribute('hx-target','#main'); retry.setAttribute('hx-push-url','true');
    const main=document.getElementById('main');
    box.style.top=`${(main?.scrollTop || 0)+(main?.querySelector('#project-tabs-host')?.getBoundingClientRect().height || 0)}px`;
    box.append(retry); main?.prepend(box); window.htmx?.process(box);
  }
  const plain = event => !event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  const linkAt = event => {
    const link = event.target.closest?.('a[href]');
    if (!link || link.target || link.hasAttribute('download') || link.closest('[inert]') || !allowed(link.href)) return null;
    if (link.getAttribute('hx-target') && link.getAttribute('hx-target') !== '#main') return null;
    if (link.hasAttribute('hx-select')) return null;
    return link;
  };
  const intent = event => { const link=linkAt(event); if (link) void preload(link.href); };
  document.addEventListener('pointerover',intent,{passive:true});
  document.addEventListener('focusin',intent);
  document.addEventListener('pointerdown',event => { if (plain(event)) intent(event); },{passive:true});
  document.addEventListener('click',event => {
    if (!plain(event)) return;
    const link=linkAt(event);
    if (link && (link.hasAttribute('hx-get') || link.closest('#project-sidebar, #project-tabs-host, [data-project-dialog], [data-project-page]'))) prepare(link.href,link.textContent);
  },true);
  const current = ticket => Boolean(ticket && active === ticket);
  const mainRequest = ctx => ctx?.target?.id === 'main' && !ctx.select && String(ctx.request?.headers?.['HX-History-Restore-Request']) !== 'true';
  document.addEventListener('htmx:before:request', event => {
    const ctx=event.detail?.ctx;
    if (!ctx?.request) return;
    if (ctx.request.method?.toUpperCase() !== 'GET') { invalidate(); return; }
    const url=allowed(ctx.request.action);
    if (!url || !mainRequest(ctx)) {
      if (['main','frame'].includes(ctx.target?.id)) cancel();
      return;
    }
    let ticket=active;
    if (!ticket || (ticket.url !== url && ticket.redirectUrl !== url)) ticket=prepare(url);
    if (!ticket) return;
    ticket.url=url; ticket.ctx=ctx; ctx.hyperNavigationTicket=ticket;
    const entry=cache.get(url), epoch=generation;
    if (entry) cache.delete(url); // one use; never replay HTML after a mutation
    const original=ctx.fetch || window.fetch.bind(window);
    ctx.fetch=async (action, request) => {
      let cached=null;
      if (entry && Date.now()<entry.expires && !entry.controller.signal.aborted) {
        // Aborting navigation must not wait for an in-flight speculative render.
        cached=await new Promise(resolve => {
          const abort=()=>resolve(null);
          request.signal?.addEventListener('abort',abort,{once:true});
          entry.promise.then(value=>{ request.signal?.removeEventListener('abort',abort); resolve(value); });
        });
      }
      if (!current(ticket) || request.signal?.aborted) throw new DOMException('Superseded navigation','AbortError');
      if (cached && epoch===generation && !entry.controller.signal.aborted && Date.now()<entry.expires) {
        ctx.hyperNavigationCached=true; return cached.response;
      }
      return original(action,request);
    };
  });
  document.addEventListener('htmx:before:response', event => {
    const ctx=event.detail?.ctx, ticket=ctx?.hyperNavigationTicket;
    if (!ticket) return;
    if (!current(ticket)) { event.preventDefault(); return; }
    const response=ctx.response?.raw;
    if (response) ticket.redirectUrl=redirect(response);
    if (ctx.response?.status>=400) { event.preventDefault(); fail(ticket); }
  });
  // Response.text() yields after before:response; guard again before HTMX can
  // push history, so a click during body decoding cannot resurrect an old page.
  document.addEventListener('htmx:after:request', event => {
    const ticket=event.detail?.ctx?.hyperNavigationTicket;
    if (ticket && !current(ticket)) event.preventDefault();
  });
  document.addEventListener('htmx:before:history:restore',()=>cancel());
  document.addEventListener('htmx:before:swap', event => {
    const ticket=event.detail?.ctx?.hyperNavigationTicket;
    if (ticket && !current(ticket)) event.preventDefault();
  });
  document.addEventListener('htmx:after:swap', event => {
    const ctx=event.detail?.ctx;
    if (ctx?.target?.id !== 'main') return;
    const ticket=ctx.hyperNavigationTicket;
    if (active && (!ticket || current(ticket))) {
      const completed=active, moveFocus=completed.overlay?.contains(document.activeElement);
      completed.position?.(); restore(completed); active=null;
      const main=document.getElementById('main');
      if (main && !reducedMotion()) for (const child of main.children) {
        if (child.id==='project-tabs-host') continue;
        child.setAttribute('data-navigation-entering','');
        setTimeout(()=>child.removeAttribute('data-navigation-entering'),200);
      }
      if (moveFocus && main) {
        const target=main.querySelector('h1, #chat-panel header h2') || main;
        const original=target.getAttribute('tabindex'); target.setAttribute('tabindex','-1'); target.focus({preventScroll:true});
        if (original===null) target.removeAttribute('tabindex'); else target.setAttribute('tabindex',original);
      }
    }
    // A speculative GET does not mark read/hot. Record a real visit only after
    // its cached page has actually landed. Never swap that second response over
    // the user's newly mounted form, selection or restored draft.
    if (ticket && ctx.hyperNavigationCached && ticket.url.startsWith('/agent/')) {
      void fetch(ticket.url,{credentials:'same-origin',cache:'no-store',headers:{'HX-Request':'true','HX-Target':'main#main'}})
        .then(response=>response.body?.cancel()).catch(error=>console.debug('Visit bookkeeping unavailable',error));
    }
    scheduleWarmup();
  });
  document.addEventListener('htmx:finally:request', event => {
    const ctx=event.detail?.ctx, ticket=ctx?.hyperNavigationTicket;
    if (current(ticket) && ticket.ctx===ctx && !ticket.redirectUrl) fail(ticket);
  });
  document.addEventListener('htmx:error', event => { const ticket=event.detail?.ctx?.hyperNavigationTicket; if (current(ticket)) fail(ticket); });
  window.addEventListener('popstate',()=>{cancel();invalidate();});
  window.addEventListener('pagehide',()=>{cancel();invalidate();});
  document.addEventListener('visibilitychange',()=>{ if (document.hidden) invalidate(); });
  document.addEventListener('projects:reorder-start',invalidate);
  window.hyperLive?.subscribe({name:'navigation-preload',onEvent:data=>{
    if (data?.type==='hello') return;
    // Any server mutation may affect cached chrome, unread badges or forms.
    invalidate();
  },resync:invalidate});
  function scheduleWarmup() {
    if (idle || !affordable()) return;
    const warm=()=>{
      idle=0; if (!affordable() || active) return;
      const urls=new Set();
      for (const link of document.querySelectorAll('#project-tabs-host a[href], #project-sidebar a[href], a[href="/llms"]')) {
        const rect=link.getBoundingClientRect(), url=allowed(link.href);
        if (!url || url===location.pathname+location.search || rect.width===0 || rect.bottom<0 || rect.top>innerHeight) continue;
        urls.add(url); if (urls.size===3) break;
      }
      for (const url of urls) void preload(url);
    };
    idle=window.requestIdleCallback ? window.requestIdleCallback(warm,{timeout:1200}) : setTimeout(warm,600);
  }
  window.hyperNavigation={prepare,isCurrent:current,preload,invalidate,cancel};
  scheduleWarmup();
})();
