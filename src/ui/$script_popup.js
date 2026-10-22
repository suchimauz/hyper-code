// One permanent popup host for the whole application. Page/agent HTMX swaps
// replace content, never the host, so tools, create-agent and secure prompts do
// not lose their target while navigating.
(() => {
    if (window.__hyperPopupInstalled) return;
    window.__hyperPopupInstalled = true;

    let returnFocus = null;
    let opened = false;
    const touch = () => window.matchMedia('(pointer: coarse)').matches;
    const editable = node => node?.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
    const finishClose = () => {
        if (!opened) return;
        opened = false;
        const dialog = document.getElementById('app-popup');
        if (dialog) delete dialog.dataset.popupKind;
        const target = returnFocus?.isConnected ? returnFocus : document.getElementById('input');
        returnFocus = null;
        present(dialog, '');
        if (touch() && editable(document.activeElement)) document.activeElement.blur();
        if (target && (!touch() || !editable(target))) target.focus({ preventScroll: true });
    };

    const present = (dialog, kind = '') => {
        const shell = dialog?.firstElementChild;
        const body = document.getElementById('app-popup-body');
        const file = kind === 'file-preview';
        if (dialog) {
            dialog.style.width = file ? 'min(90rem, calc(100vw - 2rem))' : '';
            dialog.style.height = file ? '97vh' : '';
            dialog.style.maxHeight = file ? '97vh' : '';
        }
        if (shell) {
            shell.style.height = file ? '100%' : '';
            shell.style.maxHeight = file ? '100%' : '';
        }
        if (body) body.className = file
            ? 'app-popup-body min-h-0 flex-1 overflow-hidden bg-base-200 p-0'
            : 'app-popup-body min-h-0 flex-1 overflow-auto bg-base-200/60 p-5 text-xs text-muted';
    };

    window.hyperPopup = {
        open(title = '', kind = '') {
            const dialog = document.getElementById('app-popup');
            const heading = document.getElementById('app-popup-title');
            const active = document.activeElement;
            if (!dialog?.contains(active) && active && active !== document.body) returnFocus = active;
            if (heading) heading.textContent = title;
            if (dialog && kind) dialog.dataset.popupKind = kind;
            if (dialog && !dialog.open) {
                // Native dialog.close() also restores focus. Blur the composer before
                // showModal records it, so closing cannot summon a phone keyboard.
                if (touch()) document.activeElement?.blur?.();
                opened = true;
                dialog.showModal();
            }
            present(dialog, kind);
        },
        close() {
            const dialog = document.getElementById('app-popup');
            if (dialog?.open) dialog.close();
            finishClose();
        },
        content(html, title = '', kind = '') {
            const body = document.getElementById('app-popup-body');
            if (body) body.innerHTML = html;
            this.open(title, kind);
        },

        loading(title = '', kind = '') {
            this.open(title, kind);
            const body = document.getElementById('app-popup-body');
            if (body) body.innerHTML = '<div class="text-sm text-faint">loading…</div>';
        },
    };

    // Server fragments can ask to open the permanent host without shipping
    // scripts or creating/removing overlays.
    document.addEventListener('htmx:after:swap', event => {
        const body = event.detail?.ctx?.target;
        if (body?.id !== 'app-popup-body') return;
        const content = body.querySelector('[data-popup-content], [data-secure-input]');
        if (content) {
            window.hyperPopup.open(content.dataset.popupTitle || 'Details', content.dataset.popupKind || '');
            content.querySelector('[autofocus], input, textarea, select')?.focus();
            return;
        }
        const dialog = document.getElementById('app-popup');
        if (!body.innerHTML.trim() && dialog?.dataset.popupKind) window.hyperPopup.close();
    });

    // An HX-Trigger event any response may send to dismiss the popup — used by
    // actions that start background work (manual compaction) so the modal does
    // not hang open for the whole job. htmx dispatches it on the trigger
    // element; it bubbles here.
    document.addEventListener('hyper-popup-close', () => window.hyperPopup.close());


    // Secure-input events belong to the popup subsystem. control.js only owns
    // generic runtime UI actions and must not duplicate this lifecycle.
    // The prompt lives on the server (secureInput.current), so after a gap the tab simply asks again:
    // a prompt opened while the tab was away still shows up.
    const refreshSecureInput = () => document.body.dispatchEvent(new Event('secure-input-refresh'));
    window.hyperLive.subscribe({ name: 'secure-input', types: ['secure-input.prompt', 'secure-input.prompt.closed'], onEvent: refreshSecureInput, resync: refreshSecureInput });

    // Escape is cancellation for a secure prompt, not merely visual closure.
    document.getElementById('app-popup')?.addEventListener('cancel', event => {
        const dialog = event.currentTarget;
        if (dialog?.dataset.popupKind !== 'secure-input') {
            event.preventDefault();
            window.hyperPopup.close();
            return;
        }
        event.preventDefault();
        document.querySelector('#app-popup-body [data-secure-cancel]')?.click();
    });


    document.getElementById('app-popup')?.addEventListener('close', () => {
        if (!document.getElementById('app-popup')?.open) finishClose();
    });

    document.getElementById('app-popup-close')?.addEventListener('click', () => {
        const dialog = document.getElementById('app-popup');
        if (dialog?.dataset.popupKind === 'secure-input') {
            document.querySelector('#app-popup-body [data-secure-cancel]')?.click();
            return;
        }
        window.hyperPopup.close();
    });

})();
