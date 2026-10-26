(() => {
  if (window.__projectsInstalled) return;
  window.__projectsInstalled = true;
  let timer, request = 0, navigating = false;
  let selections = Promise.resolve(), visits = Promise.resolve(), lastSelected = '';
  const hidden = () => new URLSearchParams(location.search).get('embed') === '1' || document.body.dataset.presentation === 'sidebar';
  // URL changes before HTMX swaps: never attribute the old panel to the new visit.
  const current = () => {
    const match = location.pathname.match(/^\/agent\/([^/]+)\/?$/);
    const id = document.querySelector('#main #chat-panel')?.dataset.agentId || '';
    return match && decodeURIComponent(match[1]) === id ? id : '';
  };
  const project = () => new URLSearchParams(location.search).get('projectId') || document.querySelector('#main [data-project-id]')?.dataset.projectId || '';
  let panel = null, panelKind = '', panelOpener = null;
  let pendingReturn;
  const here = () => location.pathname + location.search + location.hash;
  const projectPage = url => /^\/projects\/(view|archive)$/.test(new URL(url, location.href).pathname);
  const localUrl = value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && new URL(value, location.href).origin === location.origin;
  // Keep the entry point on this browser history entry, not in a global "last chat".
  // Internal archive/list visits carry it forward, including a full page reload.
  const returnState = () => {
    const saved = history.state?.projectReturn;
    return saved?.page === here() && localUrl(saved.source?.url) ? saved.source : null;
  };
  const snapshot = () => ({
    url: here(),
    scroll: ['main','messages'].map(id => ({id, top: document.getElementById(id)?.scrollTop || 0})),
    focus: panel ? panelKind : '',
    parent: returnState(),
    search: document.querySelector('[data-page-search]')?.value || '',
    filter: document.querySelector('[data-page-filter][aria-pressed="true"]')?.dataset.pageFilter || 'all',
  });
  const syncBack = () => {
    if (pendingReturn !== undefined) {
      history.replaceState({...history.state, projectReturn: pendingReturn && projectPage(here()) ? {page:here(),source:pendingReturn} : null}, '', location.href);
    }
    const back = document.querySelector('[data-project-page-back]'), source = returnState();
    if (back) back.setAttribute('href',source?.url || back.dataset.projectBackFallback || back.getAttribute('href'));
  };
  const restoreView = saved => {
    if (!saved || here() !== saved.url) return;
    const search = document.querySelector('[data-page-search]');
    if (search) {
      search.value = saved.search || ''; search.dispatchEvent(new Event('input',{bubbles:true}));
      [...document.querySelectorAll('[data-page-filter]')].find(el => el.dataset.pageFilter === saved.filter)?.click();
    }
    for (const entry of saved.scroll || []) {
      const el = document.getElementById(entry.id);
      if (el) { el.scrollTop = entry.top; el.dispatchEvent(new Event('scroll')); }
    }
    [...document.querySelectorAll('[data-project-panel]')].find(el => el.dataset.projectPanel === saved.focus && el.getClientRects().length)?.focus({preventScroll:true});
  };
  const panelSource = kind => document.querySelector('#project-tabs-host template[data-project-template="'+kind+'"]');
  const panelFocusKey = element => element?.getAttribute('href') || (element?.dataset.projectAction ? element.dataset.projectAction+':'+(element.dataset.chatId||element.dataset.projectId||'') : element?.getAttribute('hx-popup')) || '';
  const restorePanelFocus = () => {
    const next = panelOpener?.isConnected ? panelOpener : [...document.querySelectorAll('[data-project-panel="'+panelKind+'"]')].find(el => el.getClientRects().length);
    next?.focus({preventScroll:true});
  };
  const closePanel = (focus=true) => {
    if (!panel) return;
    const old = panel; panel = null;
    document.querySelectorAll('[data-project-panel]').forEach(el=>el.setAttribute('aria-expanded','false'));
    if (old.open) old.close();
    if (focus) restorePanelFocus();
    // Popup RPC listeners still need the clicked trigger during this event.
    queueMicrotask(()=>old.remove());
  };
  const updatePanel = () => {
    if (!panel) return;
    const source = panelSource(panelKind);
    if (!source) { closePanel(); return; }
    const focused = panel.contains(document.activeElement), key = panelFocusKey(document.activeElement), scroll = panel.scrollTop;
    panel.replaceChildren(source.content.cloneNode(true));
    window.htmx?.process(panel);
    panel.scrollTop = scroll;
    if (focused) ([...panel.querySelectorAll('a,button')].find(el=>key && panelFocusKey(el)===key) || [...panel.querySelectorAll('[data-project-panel-close]')].find(el=>el.getClientRects().length) || panel.querySelector('.project-panel-close'))?.focus({preventScroll:true});
  };
  const openPanel = button => {
    const kind = button.dataset.projectPanel, source = panelSource(kind);
    if (!source) return;
    closePanel(false); panelKind = kind; panelOpener = button;
    panel = document.createElement('dialog');
    panel.className = 'project-panel-dialog'; panel.dataset.projectDialog = kind;
    panel.dataset.projectId = project();
    panel.setAttribute('aria-labelledby','project-panel-title');
    panel.replaceChildren(source.content.cloneNode(true));
    panel.addEventListener('cancel',event=>{event.preventDefault();closePanel();});
    panel.addEventListener('click',event=>{
      if (event.target!==panel) return;
      const r=panel.getBoundingClientRect();
      if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) closePanel();
    });
    document.body.append(panel); window.htmx?.process(panel);
    if (typeof panel.showModal === 'function') panel.showModal(); else panel.setAttribute('open','');
    button.setAttribute('aria-expanded','true');
    const r=button.getBoundingClientRect();
    panel.style.setProperty('--project-panel-top',Math.max(8,r.bottom+6)+'px');
    panel.style.setProperty('--project-panel-right',Math.max(8,innerWidth-r.right)+'px');
    panel.querySelector('.project-panel-back')?.focus({preventScroll:true});
    if (!panel.querySelector('.project-panel-back')?.getClientRects().length) panel.querySelector('.project-panel-close')?.focus({preventScroll:true});
  };
  const error = message => {
    let box = document.getElementById('project-error');
    if (!box) { box = document.createElement('div'); box.id = 'project-error'; box.setAttribute('role', 'alert'); document.getElementById('main')?.prepend(box); }
    box.textContent = message;
  };
  const confirmProject = (action, button) => new Promise(resolve => {
    const restoring = action === 'restore-project';
    const label = restoring ? 'Разархивировать проект' : 'Архивировать проект';
    const dialog = document.createElement('dialog');
    dialog.id = 'project-confirm-dialog';
    dialog.className = 'm-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-ui-border bg-base-100 p-5 text-base-content shadow-2xl backdrop:bg-black/40';
    dialog.setAttribute('aria-labelledby', 'project-confirm-title');
    dialog.innerHTML = '<form method="dialog"><h2 id="project-confirm-title" class="text-base font-semibold"></h2><p data-confirm-description class="my-4 text-sm text-muted"></p><div class="flex justify-end gap-2"><button type="button" data-confirm-cancel class="rounded-md px-3 py-2 hover:bg-base-200">Отмена</button><button type="button" data-confirm-accept class="rounded-md bg-primary px-3 py-2 text-primary-content"></button></div></form>';
    dialog.querySelector('h2').textContent = label + ' «' + (button.dataset.projectTitle || button.dataset.projectId) + '»?';
    dialog.querySelector('[data-confirm-description]').textContent = restoring ? 'Проект снова появится в списке активных проектов.' : 'Чаты сохранятся, работающие агенты продолжат работу. Проект можно восстановить из архива проектов.';
    dialog.querySelector('[data-confirm-accept]').textContent = label;
    let settled = false;
    const finish = confirmed => { if (settled) return; settled = true; dialog.remove(); resolve(confirmed); if (button.isConnected) button.focus(); };
    dialog.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
    dialog.querySelector('[data-confirm-accept]').addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    dialog.addEventListener('close', () => finish(false));
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('[data-confirm-cancel]').focus();
  });
  const go = (url, returning = null) => {
    // Serialize visits too: two different links otherwise have independent HTMX
    // requests, and the older response can replace the newer page.
    const source = projectPage(url) ? (panel ? snapshot() : returnState() || (url === here() ? null : snapshot())) : null;
    closePanel(false);
    const visit = visits.then(async () => {
      await selections;
      navigating = true; ++request;
      pendingReturn = returning ? returning.parent || null : source;
      try {
        if (!window.htmx) { location.assign(url); return; }
        await window.htmx.ajax('GET', url, {target:'#main', push:'true'});
      } finally { navigating = false; navigated(); pendingReturn = undefined; }
      if (returning) { restoreView(returning); requestAnimationFrame(() => restoreView(returning)); }
    });
    visits = visit.catch(e => error(e.message));
    return visit;
  };
  const post = async (url, body) => {
    const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json', Accept:'application/json', 'X-CSRF-Token':document.querySelector('meta[name="csrf-token"]')?.content || ''}, body:JSON.stringify(body)});
    const data = await r.json().catch(() => ({error:'Request failed ('+r.status+')'}));
    if (!r.ok || data.ok === false) throw new Error(data.error || 'Request failed ('+r.status+')');
    return data;
  };
  async function refresh(select = false) {
    if (hidden() || navigating || !document.getElementById('project-sidebar')) return;
    const agentId = current(), path = location.pathname + location.search;
    if (location.pathname.startsWith('/agent/') && !agentId) return;
    const n = ++request;
    try {
      const q = new URLSearchParams({agentId, projectId:project()});
      if (select && agentId && lastSelected !== agentId) {
        lastSelected = agentId;
        selections = selections.then(() => post('/projects/action', {action:'select', agentId})).catch(e => { lastSelected = ''; error(e.message); });
      }
      await selections;
      if (n !== request || path !== location.pathname + location.search) return;
      const r = await fetch('/projects/navigation?'+q, {headers:{Accept:'application/json'}});
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not load projects');
      if (n !== request || navigating || path !== location.pathname + location.search) return;
      const sidebar = document.getElementById('project-sidebar');
      const sidebarScroll = sidebar.querySelector('.project-list')?.scrollTop || 0;
      sidebar.innerHTML = data.sidebar;
      const list = sidebar.querySelector('.project-list');
      if (list) list.scrollTop = sidebarScroll;
      let tabs = document.getElementById('project-tabs-host');
      if (!tabs) { tabs = document.createElement('div'); tabs.id='project-tabs-host'; document.getElementById('main')?.prepend(tabs); }
      const tabScroll = tabs.querySelector('.project-tab-list')?.scrollLeft || 0;
      tabs.innerHTML = data.tabs;
      if (panel) {
        document.querySelectorAll('[data-project-panel="'+panelKind+'"]').forEach(el=>el.setAttribute('aria-expanded','true'));
        updatePanel();
      }
      const tabList = tabs.querySelector('.project-tab-list');
      if (tabList) {
        tabList.scrollLeft = tabScroll;
        if (select) {
          const active = tabList.querySelector('.project-tab.selected');
          if (active) {
            const a = active.getBoundingClientRect(), l = tabList.getBoundingClientRect();
            if (a.right > l.right) tabList.scrollLeft += a.right-l.right;
            else if (a.left < l.left) tabList.scrollLeft -= l.left-a.left;
          }
        }
      }
      window.htmx?.process(sidebar);
      window.htmx?.process(tabs);
    } catch (e) { error(e.message); }
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!panel) return;
    closePanel(); e.preventDefault();
  });
  document.addEventListener('click', e => {
    const trigger=e.target.closest('[data-project-panel]');
    if (trigger) { e.preventDefault(); openPanel(trigger); return; }
    if (e.target.closest('[data-project-panel-close]')) { e.preventDefault();closePanel();return; }
    if (panel?.contains(e.target) && e.target.closest('[hx-popup]')) closePanel(false);
    const link = e.target.closest('a[href]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    if (link.matches('[data-project-page-back]')) {
      e.preventDefault(); e.stopImmediatePropagation();
      const saved = returnState(); void go(saved?.url || url.pathname + url.search, saved); return;
    }
    if (!link.closest('#project-sidebar, #project-tabs-host, [data-project-dialog], [data-project-page]') && !projectPage(url.href)) return;
    if (!/^\/(agent\/[^/]+|projects\/(view|archive))$/.test(url.pathname)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (link.closest('#nav-overlay')) window.__navClose?.();
    void go(url.pathname + url.search + url.hash); // go attaches a rejection handler to the shared visit queue
  }, true);
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-project-action]');
    if (!b) return;
    const action = b.dataset.projectAction;
    if (b.disabled) return;
    b.disabled = true;
    try {
      if (action === 'archive-project' || action === 'restore-project') {
        closePanel(false);
        if (!await confirmProject(action, b)) { restorePanelFocus(); return; }
      }
      if (action === 'archive-project' || action === 'restore-project') {
        await post('/projects/action', {action, projectId:b.dataset.projectId});
        if (location.pathname.startsWith('/projects/')) await go(location.pathname+location.search);
        else await refresh();
      } else if (action === 'archive' || action === 'restore') {
        const archiving = action !== 'restore';
        await post('/agent/'+encodeURIComponent(b.dataset.chatId)+'/'+(archiving?'archive':'unarchive'), {});
        if (archiving && current() === b.dataset.chatId) { await go('/projects/view?projectId='+encodeURIComponent(project())); return; }
        if (action === 'restore' || location.pathname === '/projects/view') { await go(location.pathname+location.search); return; }
        await refresh();
      } else {
        const data = await post('/projects/action', {action, projectId:project(), agentId:b.dataset.chatId});
        const destination = action === 'close' ? (current() === b.dataset.chatId ? data.fallbackUrl : null) : data.url;
        if (destination) await go(destination);
        else if (action === 'close' && location.pathname === '/projects/view') await go(location.pathname+location.search);
        else await refresh();
      }
    } catch (e) { error(e.message); } finally { b.disabled = false; if (!b.isConnected && !panel) restorePanelFocus(); }
  });
  const navigated = () => { closePanel(false); syncBack(); refresh(true); };
  document.addEventListener('projects:navigated', navigated);
  document.addEventListener('htmx:before:request', e => {
    if (['main','frame'].includes(e.detail?.ctx?.target?.id)) { navigating = true; ++request; }
  });
  document.addEventListener('htmx:after:swap', e => {
    if (['main','frame'].includes(e.detail?.ctx?.target?.id)) { navigating = false; navigated(); }
    else if (e.detail?.ctx?.target?.closest?.('#chat-panel') && current()) {
      clearTimeout(timer); timer = setTimeout(() => refresh(), 200);
    }
  });
  document.addEventListener('htmx:after:request', e => {
    if (['main','frame'].includes(e.detail?.ctx?.target?.id)) navigating = false;
  });
  // History restoration is asynchronous; only its actual main swap may select.
  window.addEventListener('popstate', () => { ++request; navigating = true; lastSelected = ''; });
  window.hyperLive?.subscribe({name:'project-navigation', types:['agents.changed','projects.changed'], onEvent:() => { clearTimeout(timer); timer=setTimeout(() => refresh(),200); }, resync:() => refresh()});
  syncBack();
  refresh(true);
})();
