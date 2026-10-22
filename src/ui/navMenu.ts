// The global menu (⌘/). Server/HTMX-owned: GET /nav/items draws the current tab's widget grid while the
// box is empty and grouped search results once the person types (see nav.home / nav.searchAll). The frame,
// the box, tab switching and keys live here; widgets and search sources come from `$widget_` / `$search_`.
/**
 * Render the global navigation dialog with search, widget tabs and keyboard navigation.
 * Use in the shared page shell. Touch users open search explicitly; the close button,
 * focus restoration and visible-viewport sizing keep the menu usable with an iPhone keyboard.
 * On mobile, a shared read-only account/quota strip sits between search and widget tabs.
 * Opted-in default Home grids move the existing chats tile first on mobile and restore its
 * original DOM position on desktop; custom layouts and edit mode keep their supplied order.
 */
export default function (_ctx: Context, _session: Session | null, _opts?: {}): string {
    return `<div id="nav-overlay" class="hidden fixed inset-0 z-50 bg-base-content/35 p-3 backdrop-blur-[1px]">
  <div role="dialog" aria-modal="true" aria-label="Global menu" tabindex="-1" class="flex h-full w-full flex-col overflow-hidden rounded-xl border border-ui-border bg-base-100 text-base-content shadow-2xl">
    <div class="flex items-center gap-3 border-b border-ui-border px-4">
      <i class="ph ph-magnifying-glass text-base text-faint" aria-hidden="true"></i>
      <input id="nav-q" name="q" type="search" aria-label="Search chats, projects, plugins and people" placeholder="Search chats, projects, plugins, people…" autocomplete="off"
             hx-get="/nav/items" hx-trigger="load, nav-refresh from:body, input changed delay:250ms" hx-target="#nav-results" hx-include="#nav-tab, #nav-edit" hx-sync="this:replace"
             class="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm text-base-content outline-none placeholder:text-faint">
      <input type="hidden" id="nav-tab" name="tab" value="">
      <input type="hidden" id="nav-edit" name="edit" value="">
      <kbd class="kbd kbd-xs" data-nav-keyboard-help>esc</kbd>
      <button id="nav-theme-toggle" data-action="toggle-theme" type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-base-200" aria-pressed="false" aria-label="Переключить тему" title="Переключить тему"><i class="ph ph-moon" aria-hidden="true"></i></button>
      <button id="nav-close" type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-base-200" aria-label="Close menu" title="Close menu"><i class="ph ph-x text-lg" aria-hidden="true"></i></button>
    </div>
    <button type="button" class="mobile-usage-strip" data-mobile-usage-open data-nav-mobile-usage aria-haspopup="dialog" aria-expanded="false" aria-label="Аккаунты и лимиты"><span data-mobile-usage-items><span class="mobile-usage-placeholder">Загрузка…</span></span><span data-mobile-usage-count aria-hidden="true">…</span></button>
    <div id="nav-results" class="min-h-0 flex-1 overflow-y-auto"></div>
    <details class="border-t border-ui-border px-4 py-2 text-xs">
      <summary class="cursor-pointer">Push notifications · this device</summary>
      <p id="web-push-status" role="status" aria-live="polite" class="my-2 text-muted">Action requests and stopping errors. Choose types per agent in Agent Inspector.</p>
      <button id="web-push-toggle" type="button" disabled class="btn btn-sm mb-1" aria-describedby="web-push-status">Enable push notifications</button>
    </details>
    <div data-nav-keyboard-help class="flex gap-4 border-t border-ui-border bg-base-200 px-4 py-1.5 text-3xs text-subtle">
      <span>⌘J/⌘K move</span><span>⌘←/⌘→ widget</span><span>↵ open</span><span>⌘↵ beside</span><span>⌘1–9 tab</span><span class="ml-auto">⌘/ open</span>
    </div>
  </div>
</div>
<script>
(function () {
  let sel = 0;
  const overlay = () => document.getElementById('nav-overlay');
  const query = () => document.getElementById('nav-q');
  const touch = () => window.matchMedia('(pointer: coarse)').matches;
  const narrowMenu = window.matchMedia('(max-width: 700px)');
  const coarseMenu = window.matchMedia('(max-width: 1023px) and (pointer: coarse)');
  const chatPositions = new WeakMap();
  const orderWidgets = () => {
    const grid = document.querySelector('#nav-results [data-nav-mobile-chats-first]');
    if (!grid) return false;
    const chats = Array.from(grid.children).find(tile => tile.getAttribute('data-widget-type') === 'chats');
    if (!chats) return false;
    const mobile = narrowMenu.matches || coarseMenu.matches;
    if (mobile && chats !== grid.firstElementChild) {
      if (!chatPositions.has(chats)) chatPositions.set(chats, chats.nextSibling);
      grid.insertBefore(chats, grid.firstChild);
      return true;
    }
    if (!mobile && chatPositions.has(chats)) {
      const next = chatPositions.get(chats);
      grid.insertBefore(chats, next?.parentNode === grid ? next : null);
      chatPositions.delete(chats);
      return true;
    }
    return false;
  };
  const reorderWidgets = () => {
    const selected = rows()[sel];
    if (!orderWidgets()) return;
    sel = selected ? rows().indexOf(selected) : -1;
    mark();
  };
  narrowMenu.addEventListener('change', reorderWidgets);
  coarseMenu.addEventListener('change', reorderWidgets);
  window.addEventListener('resize', reorderWidgets, { passive: true });
  let returnFocus = null;
  let viewportFrame = 0;
  const fitViewport = () => {
    const host = overlay();
    const viewport = window.visualViewport;
    const mobile = window.matchMedia('(max-width: 700px)').matches
      || (touch() && window.matchMedia('(max-width: 1023px)').matches);
    if (!host) return;
    if (!window.__navIsOpen() || !mobile || !viewport) {
      for (const name of ['height', 'top', 'bottom']) host.style.removeProperty(name);
      return;
    }
    if (Math.abs(viewport.scale - 1) > 0.01 || viewport.height <= 0) return;
    host.style.height = viewport.height + 'px';
    host.style.top = Math.max(0, viewport.offsetTop) + 'px';
    host.style.bottom = 'auto';
  };
  const scheduleViewport = () => {
    if (!window.__navIsOpen()) return;
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(fitViewport);
  };
  window.visualViewport?.addEventListener('resize', scheduleViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleViewport, { passive: true });
  window.addEventListener('resize', scheduleViewport, { passive: true });
  const rows = () => Array.from(document.querySelectorAll('#nav-results .nav-row')).filter(row => !row.closest('details:not([open])'));
  let currentProject = '';
  let selectionEpoch = 0;
  const currentPage = () => {
    const url = new URL(location.href);
    const agentId = url.pathname.startsWith('/agent/') ? decodeURIComponent(url.pathname.slice(7)) : '';
    const panelId = document.querySelector('#main #chat-panel')?.getAttribute('data-agent-id') || '';
    const projectId = url.pathname === '/projects/view' ? url.searchParams.get('projectId') || '' : '';
    const pageProject = document.querySelector('#main .project-page')?.getAttribute('data-project-id') || '';
    return { key: url.href, agentId: agentId && agentId === panelId ? agentId : '', projectId: projectId && projectId === pageProject ? projectId : '' };
  };
  const selectCurrent = async () => {
    const epoch = ++selectionEpoch;
    const page = currentPage();
    currentProject = page.projectId;
    sel = -1;
    window.__navSelId = '';
    mark();
    if (page.agentId) {
      try {
        const response = await fetch('/projects/navigation?agentId=' + encodeURIComponent(page.agentId), { credentials: 'same-origin' });
        if (!response.ok) return;
        const chrome = await response.json();
        const now = currentPage();
        if (epoch !== selectionEpoch || now.key !== page.key || now.agentId !== page.agentId) return;
        const parsed = new DOMParser().parseFromString(chrome.tabs || '', 'text/html');
        currentProject = parsed.querySelector('.project-tabs')?.getAttribute('data-project-id') || '';
      } catch (error) { console.warn('Unable to resolve current menu project', error); }
    }
    if (epoch !== selectionEpoch || currentPage().key !== page.key) return;
    sel = currentProject ? rows().findIndex(row => row.getAttribute('data-nav-id') === 'project:' + currentProject) : -1;
    if (sel < 0) sel = rows().findIndex(row => row.hasAttribute('data-nav-default'));
    mark();
  };
  // Automatic highlighting must not pull a touch menu down to the active project.
  // Explicit keyboard navigation still reveals the selected row on any device.
  const mark = (reveal = !touch()) => rows().forEach((row, index) => {
    const active = index === sel;
    row.classList.toggle('bg-base-200', active);
    row.classList.toggle('text-base-content', active);
    row.classList.toggle('ring-1', active);
    row.classList.toggle('ring-inset', active);
    row.classList.toggle('ring-ui-border-strong', active);
    row.setAttribute('aria-selected', String(active));
    const current = !!currentProject && row.getAttribute('data-nav-id') === 'project:' + currentProject;
    if (current) row.setAttribute('aria-current', 'page'); else row.removeAttribute('aria-current');
    if (active) window.__navSelId = row.getAttribute('data-nav-id') || '';
    if (active && reveal) row.scrollIntoView({ block: 'nearest' });
  });
  const move = delta => {
    const list = rows();
    if (!list.length) return;
    sel = (sel + delta + list.length) % list.length;
    mark(true);
  };
  // ⌘← / ⌘→ jump to the previous / next widget tile (or search group), landing on its first row.
  const jump = delta => {
    const list = rows();
    if (!list.length) return;
    const box = row => row.closest('[data-nav-widget],[data-nav-group]');
    const boxes = [...new Set(list.map(box))];
    const at = boxes.indexOf(box(list[sel]));
    const next = boxes[(at + delta + boxes.length) % boxes.length];
    sel = list.findIndex(row => box(row) === next);
    mark(true);
  };
  const openSelected = beside => {
    const row = rows()[sel];
    const href = row?.getAttribute('href');
    if (!href) { row?.click(); return; }
    if (beside || row.getAttribute('target') === '_blank') window.open(href, '_blank', 'noopener');
    else location.href = href;
  };
  const tabs = () => Array.from(document.querySelectorAll('#nav-results [data-nav-tab]'));
  const showTab = id => {
    window.__navSelId = '';
    const field = document.getElementById('nav-tab');
    if (!field || !id) return;
    field.value = id;
    try { localStorage.setItem('hyper.nav.tab', id); } catch {}
    document.body.dispatchEvent(new CustomEvent('nav-refresh'));
  };
  try { const saved = localStorage.getItem('hyper.nav.tab'); if (saved) document.getElementById('nav-tab').value = saved; } catch {}
  // nav-tab arrives as an HX-Trigger from POST /nav/layout (a new or moved tab) — show that tab.
  document.body.addEventListener('nav-tab', event => {
    const id = event.detail?.id;
    if (id) showTab(id);
  });
  document.addEventListener('click', event => {
    const toggle = event.target.closest?.('#nav-results [data-nav-edit-toggle]');
    if (toggle) {
      event.preventDefault();
      const field = document.getElementById('nav-edit');
      field.value = field.value === '1' ? '' : '1';
      document.body.dispatchEvent(new CustomEvent('nav-refresh'));
      return;
    }
    const button = event.target.closest?.('#nav-results [data-nav-tab]');
    if (!button) return;
    event.preventDefault();
    showTab(button.getAttribute('data-nav-tab'));
  });
  window.__navIsOpen = () => !!overlay() && !overlay().classList.contains('hidden');
  window.__navOpen = function () {
    if (!window.__navIsOpen()) returnFocus = document.activeElement;
    overlay().classList.remove('hidden');
    document.dispatchEvent(new CustomEvent('mobile-usage:sync'));
    orderWidgets();
    if (touch()) document.getElementById('nav-results').scrollTop = 0;
    void selectCurrent();
    // Focus the dialog on touch screens, not the search field: browsing needs no keyboard.
    if (touch()) overlay().querySelector('[role="dialog"]').focus({ preventScroll: true });
    else { query().focus({ preventScroll: true }); query().select(); }
    fitViewport();
  };
  window.__navClose = function () {
    const field = document.getElementById('nav-edit');
    if (field && field.value) { field.value = ''; document.body.dispatchEvent(new CustomEvent('nav-refresh')); }
    if (overlay().contains(document.activeElement)) document.activeElement.blur();
    overlay().classList.add('hidden');
    cancelAnimationFrame(viewportFrame);
    fitViewport();
    const target = returnFocus?.isConnected ? returnFocus : document.getElementById('input');
    returnFocus = null;
    // Do not summon the keyboard again when dismissing a menu opened from a composer.
    if (target && (!touch() || !target.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) target.focus({ preventScroll: true });
  };
  document.getElementById('nav-close')?.addEventListener('click', () => window.__navClose());
  overlay()?.addEventListener('click', event => { if (event.target === overlay()) window.__navClose(); });
  document.addEventListener('htmx:after:swap', event => {
    const targetId = event.detail?.ctx?.target?.id || event.detail?.target?.id;
    if (targetId === 'main' && window.__navIsOpen()) { void selectCurrent(); return; }
    if (targetId !== 'nav-results') return;
    orderWidgets();
    // Keep the selection on the same row (by data-nav-id) when the body is redrawn, e.g. by a refresh.
    const keep = window.__navSelId;
    const index = keep ? rows().findIndex(row => row.getAttribute('data-nav-id') === keep) : -1;
    sel = index >= 0 ? index : currentProject ? rows().findIndex(row => row.getAttribute('data-nav-id') === 'project:' + currentProject) : rows().findIndex(row => row.hasAttribute('data-nav-default'));
    mark();
  });
  window.addEventListener('keydown', event => {
    if (!window.__navIsOpen() || event.target.closest?.('.mobile-usage-dialog')) return;
    const key = event.key.toLowerCase();
    if (event.key === 'Escape') { event.preventDefault(); window.__navClose(); return; }
    if (event.key === 'ArrowDown' || ((event.metaKey || event.ctrlKey) && key === 'j')) { event.preventDefault(); move(1); return; }
    if (event.key === 'ArrowUp' || ((event.metaKey || event.ctrlKey) && key === 'k')) { event.preventDefault(); move(-1); return; }
    if ((event.metaKey || event.ctrlKey) && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) { event.preventDefault(); jump(event.key === 'ArrowRight' ? 1 : -1); return; }
    if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
      const tab = tabs()[Number(event.key) - 1];
      if (tab) { event.preventDefault(); showTab(tab.getAttribute('data-nav-tab')); }
      return;
    }
    if (event.key === 'Enter') {
      if (event.target.closest?.('#nav-close, #nav-theme-toggle, #nav-results form, [data-nav-mobile-usage]')) return;
      event.preventDefault(); openSelected(event.metaKey || event.ctrlKey);
    }
  }, true);
})();
</script>`;
}
