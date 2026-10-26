// The global menu (⌘/). Server/HTMX-owned: GET /nav/items draws the current tab's widget grid while the
// box is empty and grouped search results once the person types (see nav.home / nav.searchAll). The frame,
// the box, tab switching and keys live here; widgets and search sources come from `$widget_` / `$search_`.
/**
 * Render the global navigation dialog with search, widget tabs and keyboard navigation.
 * Use in the shared page shell. Touch users open search explicitly; the close button,
 * focus restoration and visible-viewport sizing keep the menu usable with an iPhone keyboard.
 * Includes a compact desktop frame, scoped pointer/focus styles and modal focus containment.
 * Keyboard row navigation moves real focus; native controls keep their own Enter behavior.
 * On mobile, a shared read-only account/quota strip sits between search and widget tabs.
 * Opted-in default Home grids move the existing chats tile first on mobile and restore its
 * original DOM position on desktop; custom layouts and edit mode keep their supplied order.
 */
export default function (_ctx: Context, _session: Session | null, _opts?: {}): string {
    return `<style>
#nav-overlay:not(.hidden) { display: grid; place-items: center; }
#nav-overlay { padding: 2rem; }
#nav-overlay > .nav-dialog { width: min(100%, 72rem); height: min(48rem, 100%); border-radius: 1.125rem; }
#nav-overlay :is(button, a[href], summary, [role="button"]):not(:disabled):not([aria-disabled="true"]) { cursor: pointer; }
#nav-overlay :is(button, input, select):disabled, #nav-overlay [aria-disabled="true"] { cursor: not-allowed; }
#nav-overlay :is(button, a[href], summary, input, select):focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
#nav-overlay .nav-heading { display: flex; align-items: center; gap: .75rem; padding: 1rem 1.25rem .75rem; }
#nav-overlay .nav-brand { display: flex; align-items: center; gap: .6rem; font-size: 1rem; font-weight: 650; }
#nav-overlay .nav-brand-mark { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: .55rem; background: var(--color-base-content); color: var(--color-base-100); font-size: 1.25rem; font-weight: 750; }
#nav-overlay .nav-heading-actions { margin-left: auto; display: flex; align-items: center; gap: .4rem; }
#nav-overlay .nav-heading-actions button { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; min-height: 2.5rem; border-radius: .65rem; padding: .5rem .7rem; }
#nav-overlay .nav-heading-actions button:hover { background: var(--color-base-200); }
#nav-overlay .nav-new-chat { background: var(--color-base-200); border: 1px solid var(--color-ui-border); }
#nav-overlay .nav-search { display: flex; align-items: center; gap: .6rem; margin: 0 1.25rem .85rem; padding: 0 .8rem; border: 1px solid var(--color-ui-border); border-radius: .7rem; background: var(--color-base-200); }
#nav-overlay .nav-search:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 16%, transparent); }
#nav-overlay #nav-q { outline: none; }
#nav-results { scrollbar-width: thin; scrollbar-color: var(--color-ui-border-strong) transparent; overscroll-behavior: contain; }
#nav-overlay [data-nav-tab] { min-height: 2.75rem; font-size: .875rem; }
#nav-overlay [data-nav-edit-toggle] { min-width: 2.5rem; min-height: 2.5rem; }
#nav-overlay [data-nav-widget] { padding: 1rem; min-width: 0; }
#nav-overlay [data-nav-widget] > h3, #nav-overlay [data-nav-widget] h4 { font-size: .75rem; line-height: 1.5; color: var(--color-muted); }
#nav-overlay .nav-row { min-height: 3.25rem; gap: .65rem; padding: .55rem .5rem; border-radius: .65rem; }
#nav-overlay [data-nav-label] { font-size: .875rem; line-height: 1.4; font-weight: 550; }
#nav-overlay [data-nav-detail], #nav-overlay [data-nav-hint], #nav-overlay [data-owner] { font-size: .75rem; line-height: 1.45; color: var(--color-muted); }
#nav-overlay [data-nav-technical-id] { display: none; }
#nav-overlay .nav-row + form button { min-width: 2rem; min-height: 2rem; border-radius: .5rem; }
#nav-overlay [data-nav-project-icon] { width: 2rem; height: 2rem; flex: none; }
#nav-overlay [data-nav-project-icon] > :is(img, svg, span) { width: 2rem; height: 2rem; }
#nav-overlay [data-nav-project-icon] img { width: 2rem; height: 2rem; border-radius: .55rem; }
#nav-overlay [data-nav-unread-count] { display: inline-flex; align-items: center; justify-content: center; min-width: 1.25rem; height: 1.25rem; padding: 0 .35rem; border-radius: 999px; font-size: .6875rem; font-weight: 650; background: var(--color-primary); color: var(--color-primary-content); }
#nav-overlay > .nav-dialog:focus { outline: none; }
#nav-overlay [data-nav-widget] .nav-row [data-nav-label] { min-width: 0; }
#nav-overlay [data-nav-overview] { grid-template-columns: minmax(12rem, .9fr) minmax(16rem, 1.6fr) minmax(14rem, 1fr); }
#nav-overlay [data-nav-overview] > [data-nav-widget] { grid-column: auto; grid-row: auto; }
#nav-overlay .nav-notifications { padding: .5rem 1.25rem; font-size: .75rem; }
#nav-overlay .nav-notifications summary { color: var(--color-muted); width: fit-content; border-radius: .3rem; }
#nav-overlay .nav-footer { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem 1rem; padding: .6rem 1.25rem; font-size: .6875rem; color: var(--color-muted); background: var(--color-base-200); border-top: 1px solid var(--color-ui-border); }
@media (max-width: 900px) { #nav-overlay [data-nav-overview] { grid-template-columns: 1fr 1.5fr; } #nav-overlay [data-nav-overview] > [data-widget-type="pages"] { grid-column: 1 / -1; } }
@media (max-width: 700px), (max-width: 1023px) and (pointer: coarse) {
  #nav-overlay > .nav-dialog { width: 100%; height: 100%; max-height: 100%; border-radius: 1.25rem; }
  #nav-overlay .nav-heading { padding: .65rem .75rem; }
  #nav-overlay .nav-heading-actions button { width: 2.75rem; min-height: 2.75rem; padding: .4rem; }
  #nav-overlay .nav-new-label { display: none; }
  #nav-overlay .nav-search { margin: 0 .75rem .6rem; }
  #nav-overlay #nav-q { font-size: max(16px, 1rem); }
  #nav-overlay [data-nav-overview] { grid-template-columns: minmax(0, 1fr); }
  #nav-overlay [data-nav-overview] > [data-nav-widget] { grid-column: auto; }
  #nav-overlay [data-nav-widget] { padding: 1rem .75rem; }
  #nav-overlay [data-nav-label] { font-size: 1.0625rem; line-height: 1.4; font-weight: 500; white-space: normal; overflow-wrap: anywhere; }
  #nav-overlay [data-nav-detail], #nav-overlay [data-nav-hint], #nav-overlay [data-owner] { font-size: .8125rem; }
  #nav-overlay .nav-row { min-height: 3.5rem; padding: .7rem .5rem; }
  #nav-overlay .nav-row + form button { min-width: 2.75rem; min-height: 2.75rem; }
  #nav-overlay .nav-notifications { padding: .4rem .75rem; }
  #nav-overlay [data-nav-keyboard-help] { display: none; }
}
</style>
<div id="nav-overlay" class="hidden fixed inset-0 z-50 bg-base-content/35 p-3 backdrop-blur-[1px]">
  <div role="dialog" aria-modal="true" aria-label="Общее меню Hyper" tabindex="-1" class="nav-dialog flex h-full w-full flex-col overflow-hidden rounded-xl border border-ui-border bg-base-100 text-base-content shadow-2xl">
    <header class="nav-heading">
      <div class="nav-brand"><span class="nav-brand-mark" aria-hidden="true">H</span>Hyper</div>
      <div class="nav-heading-actions">
        <button type="button" class="nav-new-chat" data-action="open-popup" hx-popup="ui.newAgentPopup" hx-popup-params="{}" aria-label="Новый чат" title="Новый чат"><i class="ph ph-plus" aria-hidden="true"></i><span class="nav-new-label">Новый чат</span></button>
        <button id="nav-theme-toggle" data-action="toggle-theme" type="button" class="text-muted" aria-pressed="false" aria-label="Переключить тему" title="Переключить тему"><i class="ph ph-moon" aria-hidden="true"></i></button>
        <button id="nav-close" type="button" class="text-muted" aria-label="Закрыть меню" title="Закрыть · Esc"><i class="ph ph-x" aria-hidden="true"></i></button>
      </div>
    </header>
    <div class="nav-search">
      <i class="ph ph-magnifying-glass text-base text-faint" aria-hidden="true"></i>
      <input id="nav-q" name="q" type="search" aria-label="Поиск чатов, проектов, возможностей и людей" placeholder="Найти чат, проект или возможность…" autocomplete="off"
             hx-get="/nav/items" hx-trigger="load, nav-refresh from:body, input changed delay:250ms" hx-target="#nav-results" hx-include="#nav-tab, #nav-edit" hx-sync="this:replace"
             class="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm text-base-content outline-none placeholder:text-faint">
      <input type="hidden" id="nav-tab" name="tab" value="">
      <input type="hidden" id="nav-edit" name="edit" value="">
      <kbd class="kbd kbd-xs" data-nav-keyboard-help>⌘ /</kbd>
    </div>
    <button type="button" class="mobile-usage-strip" data-mobile-usage-open data-nav-mobile-usage aria-haspopup="dialog" aria-expanded="false" aria-label="Аккаунты и лимиты"><span data-mobile-usage-items><span class="mobile-usage-placeholder">Загрузка…</span></span><span data-mobile-usage-count aria-hidden="true">…</span></button>
    <div id="nav-results" class="min-h-0 flex-1 overflow-y-auto" aria-label="Разделы и результаты поиска"></div>
    <details class="nav-notifications border-t border-ui-border">
      <summary>Уведомления этого устройства</summary>
      <p id="web-push-status" role="status" aria-live="polite" class="my-2 text-muted">Запросы действий и ошибки остановки. Типы событий выбираются в настройках чата.</p>
      <button id="web-push-toggle" type="button" disabled class="btn btn-sm mb-1" aria-describedby="web-push-status">Включить уведомления</button>
    </details>
    <div data-nav-keyboard-help class="nav-footer">
      <span>↑ ↓ выбор</span><span>↵ открыть</span><span>⌘↵ рядом</span><span>⌘1–9 вкладки</span><span class="ml-auto">Esc закрыть · ⌘/ меню</span>
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
  const expandedChats = new Set();
  const foldChats = () => {
    const mobile = narrowMenu.matches || coarseMenu.matches;
    document.querySelectorAll('#nav-results [data-widget-type="chats"]').forEach(tile => {
      const key = tile.getAttribute('data-nav-widget') || 'chats';
      const agents = Array.from(tile.querySelectorAll('.nav-row[data-nav-id^="agent:"]')).map(row => row.parentElement);
      const expanded = expandedChats.has(key);
      agents.forEach((row, index) => {
        const hide = mobile && !expanded && index >= 7;
        row.hidden = hide;
        // Row wrappers use display:flex, which otherwise overrides [hidden].
        row.style.display = hide ? 'none' : '';
      });
      let button = tile.querySelector('[data-nav-more-chats]');
      if (!mobile || agents.length <= 7) { button?.remove(); return; }
      if (!button) {
        button = document.createElement('button'); button.type = 'button';
        button.setAttribute('data-nav-more-chats', '');
        button.className = 'w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-base-200';
        button.addEventListener('click', () => {
          if (expandedChats.has(key)) expandedChats.delete(key); else expandedChats.add(key);
          foldChats();
        });
        tile.append(button);
      }
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = expanded ? 'Свернуть' : 'Показать ещё · ' + (agents.length - 7);
    });
  };
  const orderWidgets = () => {
    foldChats();
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
    query().placeholder = narrowMenu.matches || coarseMenu.matches ? 'Поиск по Hyper…' : 'Найти чат, проект или возможность…';
    const selected = rows()[sel];
    const focused = document.activeElement;
    if (!orderWidgets()) return;
    sel = selected ? rows().indexOf(selected) : -1;
    mark();
    if (focused?.isConnected && overlay().contains(focused) && window.__navIsOpen() && !modalAbove()) focused.focus({ preventScroll: true });
  };
  narrowMenu.addEventListener('change', reorderWidgets);
  coarseMenu.addEventListener('change', reorderWidgets);
  window.addEventListener('resize', reorderWidgets, { passive: true });
  let returnFocus = null;
  const background = new Map();
  const modalAbove = () => document.querySelector('dialog[open]');
  const containBackground = () => {
    let branch = overlay();
    while (branch?.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || sibling.matches('script, style, link, dialog') || background.has(sibling)) continue;
        background.set(sibling, sibling.inert);
        sibling.inert = true;
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
  };
  const releaseBackground = () => {
    for (const [element, inert] of background) element.inert = inert;
    background.clear();
  };
  const visible = element => {
    if (element.closest('[hidden], [inert], .hidden') || element.matches(':disabled, [aria-disabled="true"]')) return false;
    const closed = element.closest('details:not([open])');
    if (closed && element !== closed.querySelector('summary')) return false;
    for (let node = element; node && node !== overlay(); node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const focusables = () => Array.from(overlay().querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]')).filter(element => element.tabIndex >= 0 && visible(element));
  document.addEventListener('focusin', event => {
    if (!window.__navIsOpen?.() || modalAbove()) return;
    if (!overlay().contains(event.target)) { overlay().querySelector('[role="dialog"]').focus({ preventScroll: true }); return; }
    const row = event.target.closest?.('.nav-row');
    if (row && rows().includes(row)) { selectionEpoch++; sel = rows().indexOf(row); mark(false); }
  });
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
  const rows = () => Array.from(document.querySelectorAll('#nav-results .nav-row')).filter(row => !row.closest('details:not([open]), [hidden]'));
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
    row.removeAttribute('aria-selected');
    const current = !!currentProject && row.getAttribute('data-nav-id') === 'project:' + currentProject;
    if (current) row.setAttribute('aria-current', 'page'); else row.removeAttribute('aria-current');
    if (active) window.__navSelId = row.getAttribute('data-nav-id') || '';
    if (active && reveal) row.scrollIntoView({ block: 'nearest' });
  });
  const move = delta => {
    const list = rows();
    if (!list.length) return;
    selectionEpoch++;
    sel = sel < 0 ? (delta > 0 ? 0 : list.length - 1) : (sel + delta + list.length) % list.length;
    mark(true);
    list[sel].focus({ preventScroll: true });
  };
  // ⌘← / ⌘→ jump to the previous / next widget tile (or search group), landing on its first row.
  const jump = delta => {
    const list = rows();
    if (!list.length) return;
    const box = row => row.closest('[data-nav-widget],[data-nav-group]');
    const boxes = [...new Set(list.map(box))];
    const at = list[sel] ? boxes.indexOf(box(list[sel])) : -1;
    const next = boxes[(at + delta + boxes.length) % boxes.length];
    selectionEpoch++;
    sel = list.findIndex(row => box(row) === next);
    mark(true);
    list[sel]?.focus({ preventScroll: true });
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
    query().value = '';
    try { localStorage.setItem('hyper.nav.tab', id); } catch (error) { console.debug('Menu tab preference unavailable', error); }
    document.body.dispatchEvent(new CustomEvent('nav-refresh'));
  };
  try { const saved = localStorage.getItem('hyper.nav.tab'); if (saved) document.getElementById('nav-tab').value = saved; } catch (error) { console.debug('Menu tab preference unavailable', error); }
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
    containBackground();
    query().placeholder = narrowMenu.matches || coarseMenu.matches ? 'Поиск по Hyper…' : 'Найти чат, проект или возможность…';
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
    releaseBackground();
    cancelAnimationFrame(viewportFrame);
    fitViewport();
    const target = returnFocus?.isConnected ? returnFocus : document.getElementById('input');
    returnFocus = null;
    // Do not summon the keyboard again when dismissing a menu opened from a composer.
    if (target && (!touch() || !target.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) target.focus({ preventScroll: true });
  };
  document.getElementById('nav-close')?.addEventListener('click', () => window.__navClose());
  overlay()?.addEventListener('click', event => { if (event.target === overlay()) window.__navClose(); });
  let swapFocus = null;
  document.addEventListener('htmx:before:swap', event => {
    const targetId = event.detail?.ctx?.target?.id || event.detail?.target?.id;
    const active = document.activeElement;
    if (targetId !== 'nav-results' || !window.__navIsOpen() || !document.getElementById('nav-results').contains(active)) return;
    swapFocus = active.hasAttribute('data-nav-tab') ? { tab: active.getAttribute('data-nav-tab') }
      : active.hasAttribute('data-nav-edit-toggle') ? { edit: true }
      : active.classList.contains('nav-row') ? { row: active.getAttribute('data-nav-id') } : { fallback: true };
  });
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
    if (swapFocus && window.__navIsOpen() && !modalAbove()) {
      const next = swapFocus.tab ? tabs().find(button => button.getAttribute('data-nav-tab') === swapFocus.tab)
        : swapFocus.edit ? document.querySelector('#nav-results [data-nav-edit-toggle]')
        : swapFocus.row ? rows().find(row => row.getAttribute('data-nav-id') === swapFocus.row) : null;
      (next || overlay().querySelector('[role="dialog"]')).focus({ preventScroll: true });
    }
    swapFocus = null;
  });
  window.addEventListener('keydown', event => {
    if (!window.__navIsOpen() || modalAbove() || event.target.closest?.('.mobile-usage-dialog') || event.isComposing) return;
    const key = event.key.toLowerCase();
    const target = event.target;
    const modifier = event.metaKey || event.ctrlKey;
    const rowTarget = target.closest?.('.nav-row');
    const navigating = target === query() || rowTarget || target === overlay().querySelector('[role="dialog"]');
    if (event.key === 'Tab') {
      const list = focusables(), first = list[0], last = list[list.length - 1];
      if (!first) { event.preventDefault(); overlay().querySelector('[role="dialog"]').focus(); return; }
      if (event.shiftKey && (target === first || !list.includes(target))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (target === last || !list.includes(target))) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (query().value) { query().value = ''; document.body.dispatchEvent(new CustomEvent('nav-refresh')); query().focus(); }
      else window.__navClose();
      return;
    }
    if (navigating && (event.key === 'ArrowDown' || (modifier && key === 'j'))) { event.preventDefault(); move(1); return; }
    if (navigating && (event.key === 'ArrowUp' || (modifier && key === 'k'))) { event.preventDefault(); move(-1); return; }
    if (navigating && modifier && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) { event.preventDefault(); jump(event.key === 'ArrowRight' ? 1 : -1); return; }
    if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
      const tab = tabs()[Number(event.key) - 1];
      if (tab) { event.preventDefault(); showTab(tab.getAttribute('data-nav-tab')); }
      return;
    }
    if (event.key === 'Enter' && (target === query() || (modifier && rowTarget))) {
      event.preventDefault(); openSelected(modifier);
    }
  }, true);
})();
</script>`;
}
