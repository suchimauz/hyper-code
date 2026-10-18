// Present the existing inspector, not a second copy of its forms or live slots.
// The chat stays mounted underneath a native modal; opening does not navigate.
(() => {
    if (window.__hyperMobileInspectorInstalled) return;
    window.__hyperMobileInspectorInstalled = true;
    const small = matchMedia('(max-width: 700px)');
    const touch = matchMedia('(max-width: 1023px) and (pointer: coarse)');
    const mobile = () => small.matches || touch.matches;
    let active = null;

    function close(restoreFocus = true) {
        const state = active;
        if (!state) return;
        active = null;
        const { panel, marker, dialog, trigger, messages, scrollTop } = state;
        // Put the very same live panel back, including expanded sections and edits.
        if (marker.parentNode) marker.replaceWith(panel);
        else panel.remove();
        trigger.setAttribute('aria-expanded', 'false');
        if (dialog.open) dialog.close();
        dialog.remove();
        if (messages.isConnected) {
            messages.scrollTop = scrollTop;
            messages.dispatchEvent(new Event('scroll'));
            // The software keyboard can finish closing after the modal does.
            requestAnimationFrame(() => {
                if (!active && messages.isConnected) messages.scrollTop = scrollTop;
            });
        }
        if (restoreFocus && mobile() && trigger.isConnected) trigger.focus({ preventScroll: true });
    }

    function sync() {
        if (active && (!mobile() || !active.page.isConnected)) close(false);
        document.querySelectorAll('[data-mobile-inspector-open]').forEach(trigger => {
            const page = trigger.closest('[data-page="agent"]');
            const panel = document.getElementById(trigger.getAttribute('aria-controls'));
            const allowed = page && panel && document.body.dataset.presentation !== 'sidebar';
            trigger.toggleAttribute('data-inspector-ready', Boolean(allowed));
        });
    }

    function open(trigger) {
        if (!mobile() || active || !trigger.hasAttribute('data-inspector-ready')) return;
        const page = trigger.closest('[data-page="agent"]');
        const panel = document.getElementById(trigger.getAttribute('aria-controls'));
        const messages = page?.querySelector('#messages');
        if (!panel || !messages || typeof HTMLDialogElement === 'undefined') return;
        const dialog = document.createElement('dialog');
        if (typeof dialog.showModal !== 'function') return;
        dialog.setAttribute('data-mobile-inspector-dialog', '');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', panel.querySelector('[data-mobile-inspector-header] h2').id);
        const marker = document.createComment('mobile inspector position');
        const scrollTop = messages.scrollTop;
        panel.before(marker);
        dialog.append(panel);
        document.body.append(dialog);
        active = { panel, marker, dialog, trigger, page, messages, scrollTop };
        trigger.setAttribute('aria-expanded', 'true');
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        dialog.addEventListener('close', () => { if (active?.dialog === dialog) close(); });
        // No focus returns to the composer, so closing never summons the keyboard.
        document.activeElement?.blur?.();
        dialog.showModal();
        panel.querySelector('[data-mobile-inspector-close]').focus({ preventScroll: true });
    }

    document.addEventListener('click', event => {
        const trigger = event.target.closest?.('[data-mobile-inspector-open]');
        if (trigger) { event.preventDefault(); open(trigger); return; }
        if (event.target.closest?.('[data-mobile-inspector-close]')) { event.preventDefault(); close(); }
    });
    document.addEventListener('htmx:before:swap', event => {
        if (!active) return;
        const target = event.detail?.ctx?.target;
        if (target === active.page || target?.contains?.(active.page)) close(false);
    });
    for (const name of ['htmx:after:process', 'htmx:after:swap', 'htmx:history:restore']) document.addEventListener(name, sync);
    small.addEventListener('change', sync);
    touch.addEventListener('change', sync);
    window.addEventListener('pageshow', sync);
    sync();
})();
