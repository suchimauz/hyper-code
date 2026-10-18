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
  const go = url => {
    // Serialize visits too: two different links otherwise have independent HTMX
    // requests, and the older response can replace the newer page.
    const visit = visits.then(async () => {
      await selections;
      navigating = true; ++request;
      try {
        if (!window.htmx) { location.assign(url); return; }
        await window.htmx.ajax('GET', url, {target:'#main', push:'true'});
      } finally { navigating = false; navigated(); }
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
      const chooser = tabs.querySelector('.project-mobile-switcher');
      const chooserOpen = Boolean(chooser?.open);
      const chooserScroll = chooser?.querySelector('nav')?.scrollTop || 0;
      const focused = chooser?.contains(document.activeElement) ? document.activeElement : null;
      const focusHref = focused?.getAttribute('href');
      tabs.innerHTML = data.tabs;
      const nextChooser = tabs.querySelector('.project-mobile-switcher');
      if (nextChooser) {
        nextChooser.open = chooserOpen;
        const menu = nextChooser.querySelector('nav');
        if (menu) menu.scrollTop = chooserScroll;
        if (focused) {
          const nextFocus = focusHref ? [...nextChooser.querySelectorAll('a[href]')].find(a => a.getAttribute('href') === focusHref) : null;
          (nextFocus || nextChooser.querySelector('summary'))?.focus({preventScroll:true});
        }
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
    const chooser = document.querySelector('.project-mobile-switcher[open]');
    if (!chooser) return;
    chooser.open = false;
    chooser.querySelector('summary')?.focus();
    e.preventDefault();
  });
  document.addEventListener('click', e => {
    const chooser = document.querySelector('.project-mobile-switcher[open]');
    if (chooser && (!chooser.contains(e.target) || e.target.closest('a[href]'))) chooser.open = false;
    const link = e.target.closest('a[href]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !link.closest('#project-sidebar, #project-tabs-host') || !/^\/(agent\/[^/]+|projects\/view)$/.test(url.pathname)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    void go(url.pathname + url.search); // go attaches a rejection handler to the shared visit queue
  }, true);
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-project-action]');
    if (!b) return;
    const action = b.dataset.projectAction;
    if (b.disabled) return;
    b.disabled = true;
    try {
      if ((action === 'archive-project' || action === 'restore-project') && !await confirmProject(action, b)) return;
      if (action === 'archive-project' || action === 'restore-project') {
        await post('/projects/action', {action, projectId:b.dataset.projectId});
        if (action === 'restore-project' || location.pathname === '/projects/view') await go(location.pathname+location.search);
        else await refresh();
      } else if (action === 'archive' || action === 'restore') {
        const archiving = action !== 'restore';
        await post('/agent/'+encodeURIComponent(b.dataset.chatId)+'/'+(archiving?'archive':'unarchive'), {});
        if (archiving && current() === b.dataset.chatId) { await go('/projects/view?projectId='+encodeURIComponent(project())); return; }
        if (action === 'restore') { await go(location.pathname+location.search); return; }
        await refresh();
      } else {
        const data = await post('/projects/action', {action, projectId:project(), agentId:b.dataset.chatId});
        const destination = action === 'close' ? (current() === b.dataset.chatId ? data.fallbackUrl : null) : data.url;
        if (destination) await go(destination); else await refresh();
      }
    } catch (e) { error(e.message); } finally { b.disabled = false; }
  });
  const navigated = () => { refresh(true); };
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
  refresh(true);
})();
