// The Dock's own editing: drag entries within and between the two zones, right click for
// hide / move / reset. Moves happen in place (entries keep their live scripts), then the new
// layout is saved for this person. Showing a hidden entry or resetting reloads the page.
(() => {
    if (window.__hyperDockInstalled) return;
    window.__hyperDockInstalled = true;
    const dock = () => document.getElementById('dock');
    const zone = name => document.getElementById('dock-' + name);
    const ids = el => el ? [...el.querySelectorAll(':scope > .dock-item[data-dock-id]')].map(x => x.dataset.dockId) : [];
    const hidden = () => { try { return JSON.parse(dock()?.dataset.dockHidden || '[]'); } catch { return []; } };
    const labels = () => { try { return JSON.parse(dock()?.dataset.dockLabels || '{}'); } catch { return {}; } };
    async function save(extra = {}) {
        const body = { top: ids(zone('top')), bottom: ids(zone('bottom')), hidden: hidden(), ...extra };
        const res = await fetch('/dock/layout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { window.toast?.({ level: 'error', message: 'Could not save the Dock' }); return null; }
        const saved = await res.json();
        if (dock() && saved.layout) dock().dataset.dockHidden = JSON.stringify(saved.layout.hidden || []);
        return saved;
    }
    async function reset() {
        await fetch('/dock/layout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reset: true }) });
        location.reload();
    }

    // ── drag ────────────────────────────────────────────────────────────────
    let dragged = null;
    document.addEventListener('dragstart', e => {
        const item = e.target.closest?.('#dock .dock-item[data-dock-id]');
        if (!item) return;
        dragged = item;
        item.classList.add('opacity-40');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.dockId);
    });
    document.addEventListener('dragover', e => {
        if (!dragged) return;
        const z = e.target.closest?.('#dock .dock-zone');
        if (!z) return;
        e.preventDefault();
        const after = [...z.querySelectorAll(':scope > .dock-item')].filter(x => x !== dragged)
            .find(x => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
        if (after) z.insertBefore(dragged, after); else z.appendChild(dragged);
    });
    document.addEventListener('dragend', () => {
        if (!dragged) return;
        dragged.classList.remove('opacity-40');
        dragged = null;
        save();
    });
    const arm = () => document.querySelectorAll('#dock .dock-item[data-dock-id]').forEach(x => { x.draggable = true; });

    // ── context menu ────────────────────────────────────────────────────────
    let menu = null;
    const close = () => { menu?.remove(); menu = null; };
    function open(x, y, entries) {
        close();
        menu = document.createElement('div');
        menu.setAttribute('role', 'menu');
        menu.className = 'fixed z-[60] min-w-44 rounded-lg border border-ui-border bg-base-100 p-1 text-xs shadow-xl';
        for (const entry of entries) {
            if (entry === '-') { const hr = document.createElement('div'); hr.className = 'my-1 border-t border-ui-border'; menu.appendChild(hr); continue; }
            const b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('role', 'menuitem');
            b.className = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-muted hover:bg-base-200 hover:text-base-content';
            b.innerHTML = `<i class="ph ${entry.icon}" aria-hidden="true"></i>`;
            b.append(entry.label);
            b.addEventListener('click', () => { close(); entry.run(); });
            menu.appendChild(b);
        }
        document.body.appendChild(menu);
        menu.style.left = x + 'px';
        menu.style.top = Math.min(y, innerHeight - menu.offsetHeight - 8) + 'px';
    }
    document.addEventListener('click', e => { if (menu && !menu.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.addEventListener('contextmenu', e => {
        const bar = e.target.closest?.('#dock');
        if (!bar) return;
        e.preventDefault();
        const item = e.target.closest('.dock-item[data-dock-id]');
        const names = labels();
        const entries = [];
        if (item) {
            const id = item.dataset.dockId;
            const inTop = item.parentElement?.id === 'dock-top';
            const kind = item.dataset.dockPinned;
            if (kind) entries.push({ icon: 'ph-push-pin-slash', label: 'Unpin ' + (names[id] || id), run: () => { item.remove(); pin(kind, id.slice(kind.length + 1), false); } });
            else entries.push({ icon: 'ph-eye-slash', label: 'Hide ' + (names[id] || id), run: () => { const h = hidden(); h.push(id); item.remove(); save({ hidden: h }); } });
            entries.push({ icon: inTop ? 'ph-arrow-line-down' : 'ph-arrow-line-up', label: inTop ? 'Move to bottom' : 'Move to top', run: () => { (inTop ? zone('bottom') : zone('top'))?.appendChild(item); save(); } });
            entries.push('-');
        }
        for (const id of hidden()) entries.push({ icon: 'ph-eye', label: 'Show ' + (names[id] || id), run: async () => { await save({ hidden: hidden().filter(x => x !== id) }); location.reload(); } });
        const here = location.pathname + location.search;
        const pinnedHere = !!document.querySelector(`#dock [data-dock-id="${CSS.escape('page:' + here)}"]`);
        const agentHere = /^\/agent\/([A-Za-z0-9_-]+)$/.exec(location.pathname)?.[1];
        if (agentHere && !document.querySelector(`#dock [data-dock-id="agent:${CSS.escape(agentHere)}"]`)) entries.push({ icon: 'ph-push-pin', label: 'Pin this chat', run: () => pin('agent', agentHere, true) });
        else if (!agentHere && !pinnedHere) entries.push({ icon: 'ph-push-pin', label: 'Pin this page', run: () => pin('page', here, true) });
        entries.push({ icon: 'ph-arrow-counter-clockwise', label: 'Reset Dock', run: reset });
        open(e.clientX + 2, e.clientY + 2, entries);
    });

    // Theme preference is separate from the resolved light/dark palette.
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    let themeMode = document.documentElement.dataset.themeMode || 'auto';
    try { const saved = localStorage.getItem('hyper-theme'); themeMode = ['light', 'dark', 'auto'].includes(saved) ? saved : 'auto'; } catch (_) {}
    const themeNames = { light: 'Светлая', dark: 'Тёмная', auto: 'Auto (системная)' };
    const nextTheme = () => ({ light: 'dark', dark: 'auto', auto: 'light' })[themeMode];
    function paintTheme() {
        document.querySelectorAll('[data-action="toggle-theme"]').forEach(button => {
            button.removeAttribute('aria-pressed');
            const label = 'Тема: ' + themeNames[themeMode] + '. Переключить: ' + themeNames[nextTheme()];
            button.title = label;
            button.setAttribute('aria-label', label);
            button.dataset.themeMode = themeMode;
            const icon = button.querySelector('i');
            if (icon) icon.className = 'ph ' + ({ light: 'ph-sun', dark: 'ph-moon', auto: 'ph-desktop' })[themeMode];
        });
    }
    let chromeFrame = 0;
    function refreshThemeColor(color) {
        // WebKit can defer an in-place content mutation until navigation. Replace
        // the node after the palette has painted; cancel stale rapid toggles.
        if (chromeFrame) cancelAnimationFrame(chromeFrame);
        chromeFrame = requestAnimationFrame(() => {
            chromeFrame = 0;
            const meta = document.createElement('meta');
            meta.name = 'theme-color';
            meta.content = color;
            document.querySelectorAll('meta[name="theme-color"]').forEach(old => old.remove());
            document.head.appendChild(meta);
        });
    }
    function applyTheme() {
        const theme = themeMode === 'auto' ? (systemTheme.matches ? 'dark' : 'light') : themeMode;
        const root = document.documentElement;
        root.dataset.themeMode = themeMode;
        root.dataset.theme = theme;
        root.style.colorScheme = theme;
        const color = theme === 'dark' ? '#252a34' : '#ffffff';
        root.style.backgroundColor = color;
        document.querySelectorAll('meta[name="theme-color"]').forEach(meta => { meta.content = color; });
        document.querySelectorAll('meta[name="apple-mobile-web-app-status-bar-style"]').forEach(meta => { meta.content = theme === 'dark' ? 'black' : 'default'; });
        refreshThemeColor(color);
        paintTheme();
    }
    document.addEventListener('click', e => {
        if (!e.target.closest?.('[data-action="toggle-theme"]')) return;
        themeMode = nextTheme();
        try { localStorage.setItem('hyper-theme', themeMode); } catch (_) {}
        applyTheme();
    });
    systemTheme.addEventListener('change', () => { if (themeMode === 'auto') applyTheme(); });
    window.addEventListener('pageshow', applyTheme);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) applyTheme(); });
    window.addEventListener('storage', e => {
        if (e.key !== 'hyper-theme' && e.key !== null) return;
        themeMode = ['light', 'dark', 'auto'].includes(e.newValue) ? e.newValue : 'auto';
        applyTheme();
    });
    applyTheme();

    // ── refresh after a pin changes (HX-Trigger dock-refresh, or the dock.changed event) ──
    let refreshing = false;
    async function refresh() {
        if (refreshing || dragged || document.querySelector('#dock :popover-open')) return;
        refreshing = true;
        try {
            const res = await fetch('/dock', { cache: 'no-store' });
            if (!res.ok) return;
            const current = dock();
            if (!current) return;
            const tpl = document.createElement('template');
            tpl.innerHTML = (await res.text()).trim();
            const next = tpl.content.querySelector('#dock');
            if (!next) return;
            next.querySelectorAll('script').forEach(s => s.remove());
            current.replaceWith(next);
            window.htmx?.process?.(next);
            setup();
        } catch (_) { /* the next change retries */ } finally { refreshing = false; }
    }
    window.hyperDock = { refresh, pin };
    document.body.addEventListener('dock-refresh', refresh);
    window.hyperLive.subscribe({ name: 'dock', types: ['dock.changed'], onEvent: refresh, resync: refresh });

    async function pin(kind, target, pinned = true) {
        const res = await fetch('/dock/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, target, pinned }) });
        if (!res.ok) { window.toast?.({ level: 'error', message: 'Could not change the Dock' }); return; }
        refresh();
        document.body.dispatchEvent(new CustomEvent('nav-refresh'));
    }

    const setup = () => { arm(); paintTheme(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
    document.addEventListener('htmx:after:swap', arm);
})();
