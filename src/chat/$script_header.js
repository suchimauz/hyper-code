// The ⋯ chat panel loads its cards when it opens, so they are fresh and never slow down the chat itself.
(() => {
    if (window.__chatHeaderInstalled) return;
    window.__chatHeaderInstalled = true;
    document.addEventListener('toggle', async (event) => {
        const panel = event.target;
        if (!(panel instanceof HTMLElement) || !panel.matches('[data-chat-panel]')) return;
        const trigger = [...document.querySelectorAll('[data-chat-menu-trigger]')].find(button => button.getAttribute('popovertarget') === panel.id);
        trigger?.setAttribute('aria-expanded', String(event.newState === 'open'));
        if (event.newState !== 'open') return;
        const body = panel.querySelector('[data-chat-panel-body]') || panel;
        try {
            const res = await fetch(panel.getAttribute('data-chat-panel'), { headers: { 'hx-request': 'true' }, credentials: 'same-origin' });
            body.innerHTML = res.ok ? await res.text() : `<div class="p-3 text-xs text-error">Could not load the panel (${res.status})</div>`;
            window.htmx?.process?.(body);
            // Also notify controls installed after the initial page render.
            document.dispatchEvent(new Event('htmx:after:process'));
        } catch (error) {
            body.innerHTML = '<div class="p-3 text-xs text-error">Could not load the panel</div>';
        }
    }, true);
    // A popup opened from a panel row replaces the panel: close it so the two never overlap.
    document.addEventListener('click', (event) => {
        const close = event.target.closest?.('[data-chat-panel-close]');
        const row = event.target.closest?.('[data-chat-panel] [hx-popup], [data-chat-panel] [data-canvas-toggle], [data-chat-panel] [data-mobile-inspector-open]');
        const panel = (close || row)?.closest('[data-chat-panel]');
        if (panel) {
            panel.hidePopover?.();
            if (close) document.querySelector('[popovertarget="' + CSS.escape(panel.id) + '"]')?.focus({ preventScroll: true });
        }
    }, true);
})();
