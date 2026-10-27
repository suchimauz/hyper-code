// Universal message-action progressive enhancement. Existing HTMX buttons remain the authority
// for actions/confirmations; this sheet never copies URLs or submits requests.
(() => {
    if (window.__hyperMobileMessage) return;
    window.__hyperMobileMessage = true;
    const actionSelector = 'button[data-action="delete-one"], button[data-action="delete-from"]';
    const nativeSelector = 'a, button, input, textarea, select, option, label, form, pre, code, summary, audio, video, iframe, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="textbox"], [data-input-id], [data-input-card], [data-input-kind], [data-chat-code-block]';
    let hold = null;
    let lastScroll = -Infinity;
    const selected = () => !!window.getSelection()?.toString();
    function cancelHold() {
        if (hold) clearTimeout(hold.timer);
        hold = null;
    }
    function eligible(target) {
        if (!target?.closest || target.closest(nativeSelector) || selected()) return null;
        const message = target.closest('#messages [id^="m-"]');
        if (!message || !/^m-\d+$/.test(message.id) || message.parentElement.closest('[id^="m-"]')) return null;
        return message.classList.contains('mobile-message-enhanced') ? message : null;
    }
    let sheet = null;
    let origin = null;
    let source = null;
    let scheduled = false;
    const button = (text, attr, icon) => {
        const el = document.createElement('button');
        el.type = 'button';
        const glyph = document.createElement('i');
        glyph.className = `ph ph-${icon}`;
        glyph.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = text;
        el.append(glyph, label);
        el.setAttribute(attr, '');
        el.dataset.noCopy = '';
        return el;
    };
    function close() {
        cancelHold();
        if (!sheet) return;
        const previous = origin;
        const old = sheet;
        sheet = null;
        origin = null;
        source = null;
        if (old.open) old.close();
        old.remove();
        if (previous?.isConnected && !document.querySelector('dialog[open]')) previous.focus({ preventScroll: true });
    }
    function open(message, point) {
        close();
        if (document.querySelector('dialog[open]')) return;
        if (!message?.isConnected) return;
        const actions = [...message.querySelectorAll(actionSelector)];
        if (!actions.length) return;
        source = message;
        origin = message;
        sheet = document.createElement('dialog');
        sheet.className = 'mobile-message-sheet';
        sheet.setAttribute('aria-label', 'Действия с сообщением');
        const heading = document.createElement('h2');
        heading.textContent = 'Действия с сообщением';
        sheet.append(heading);
        const copyText = button('Копировать текст', 'data-mobile-message-copy', 'copy');
        const copyStatus = document.createElement('span');
        copyStatus.setAttribute('role', 'status');
        copyStatus.setAttribute('aria-live', 'polite');
        copyText.addEventListener('click', async () => {
            const content = message.querySelector('.assistant .prose, .assistant, .chat-glass-primary, .whitespace-pre-wrap') || message;
            if (!content) { copyStatus.textContent = 'Нет текста для копирования'; return; }
            const clean = content.cloneNode(true);
            clean.querySelectorAll('[data-no-copy], button, input, textarea, select, script, style, template, iframe, .tool, [data-tool], [data-author], [aria-hidden="true"], [role="tooltip"], [aria-label^="Gate:"], [aria-label^="Tools:"]').forEach(node => node.remove());
            clean.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
            clean.querySelectorAll('p, div, pre, li, h1, h2, h3, h4, blockquote, tr').forEach(node => node.append('\n'));
            copyText.disabled = true;
            try {
                await window.hyperCopyText((clean.textContent || '').trim());
                // A late clipboard response must not dismiss a newer menu.
                if (sheet === currentSheet) close();
            } catch {
                copyStatus.textContent = 'Не удалось скопировать. Выделите текст вручную.';
            } finally {
                copyText.disabled = false;
            }
        });
        sheet.append(copyText, copyStatus);
        for (const action of actions) {
            const single = action.dataset.action === 'delete-one';
            const proxy = button(single ? 'Удалить сообщение' : 'Удалить начиная отсюда', 'data-mobile-sheet-action', single ? 'trash' : 'list-dashes');
            proxy.dataset.danger = '';
            proxy.disabled = action.disabled;
            proxy.addEventListener('click', () => {
                close();
                // The original button retains hx-confirm, vals, target and all guards.
                if (action.isConnected && !action.disabled) action.click();
            });
            sheet.append(proxy);
        }
        const dismiss = button('Закрыть', 'data-mobile-sheet-close', 'x');
        dismiss.addEventListener('click', close);
        sheet.append(dismiss);
        sheet.addEventListener('cancel', event => { event.preventDefault(); close(); });
        const currentSheet = sheet;
        sheet.addEventListener('close', () => { if (sheet === currentSheet) close(); });
        const viewport = window.visualViewport;
        const left = viewport?.offsetLeft || 0;
        const top = viewport?.offsetTop || 0;
        const width = viewport?.width || window.innerWidth;
        const height = viewport?.height || window.innerHeight;
        const gap = 8;
        Object.assign(sheet.style, {
            position: 'fixed', margin: '0',
            maxWidth: `${Math.max(0, width - gap * 2)}px`,
            maxHeight: `${Math.max(0, height - gap * 2)}px`, overflowY: 'auto',
        });
        document.body.append(sheet);
        sheet.show(); // Nonmodal popover: the rest of the page stays interactive.
        const anchor = message.getBoundingClientRect();
        const rect = sheet.getBoundingClientRect();
        const x = point?.x ?? anchor.left;
        const y = point?.y ?? anchor.bottom;
        sheet.style.left = `${Math.max(left + gap, Math.min(x, left + width - rect.width - gap))}px`;
        sheet.style.top = `${Math.max(top + gap, Math.min(y, top + height - rect.height - gap))}px`;
        copyText.focus({ preventScroll: true });
    }
    function enhance() {
        scheduled = false;
        if (hold && !hold.trigger.isConnected) cancelHold();
        if (sheet && (!source?.isConnected || [...document.querySelectorAll('dialog[open]')].some(dialog => dialog !== sheet))) close();
        const messages = document.querySelector('#messages');
        if (!messages) return;
        for (const message of messages.querySelectorAll('[id^="m-"]')) {
            if (!/^m-\d+$/.test(message.id) || message.parentElement.closest('[id^="m-"]')) continue;
            const actions = message.querySelectorAll(actionSelector);
            message.querySelectorAll('[data-mobile-message-actions]').forEach(node => node.remove());
            if (!actions.length) continue;
            message.classList.add('mobile-message-enhanced');
            message.setAttribute('tabindex', '0');
            message.setAttribute('aria-keyshortcuts', 'Shift+F10');
            message.setAttribute('aria-haspopup', 'dialog');
        }
    }
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(enhance);
    }
    // This runtime uses colon-delimited HTMX lifecycle names. Size newly inserted
    // code before ChatController restores older-history anchors in its bubble listener.
    document.addEventListener('htmx:after:swap', enhance, true);
    document.addEventListener('htmx:after:process', enhance, true);
    document.addEventListener('htmx:before:swap', event => {
        const target = event.detail?.ctx?.target;
        if (hold && (target === hold.trigger.closest('[id^="m-"]') || target?.contains?.(hold.trigger))) cancelHold();
        if (sheet && (target === source || target?.contains?.(source))) close();
    });
    document.addEventListener('htmx:afterSwap', schedule);
    document.addEventListener('htmx:beforeCleanupElement', event => {
        if (hold && event.detail?.elt?.contains?.(hold.trigger)) cancelHold();
        if (sheet && (event.detail?.elt === source || event.detail?.elt?.contains(source))) close();
    });
    window.addEventListener('resize', () => { close(); schedule(); });
    window.visualViewport?.addEventListener('resize', close);
    window.visualViewport?.addEventListener('scroll', close);
    window.addEventListener('blur', cancelHold);
    document.addEventListener('visibilitychange', cancelHold);
    document.addEventListener('pointerdown', event => {
        cancelHold();
        if (sheet && !sheet.contains(event.target)) { close(); return; }
        if (event.button !== 0 || event.isPrimary === false || sheet || document.querySelector('dialog[open]') || performance.now() - lastScroll < 180) return;
        const trigger = eligible(event.target);
        if (!trigger) return;
        const pending = { trigger, id: event.pointerId, x: event.clientX, y: event.clientY, timer: null };
        pending.timer = setTimeout(() => {
            if (hold !== pending) return;
            cancelHold();
            if (!selected() && trigger.isConnected) open(trigger, { x: pending.x, y: pending.y });
        }, 520);
        hold = pending;
        // Never preventDefault or capture: native selection and scrolling win.
    }, true);
    document.addEventListener('pointermove', event => {
        if (hold && event.pointerId === hold.id && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 8) cancelHold();
    }, true);
    for (const name of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(name, cancelHold, true);
    document.addEventListener('selectionchange', () => { if (selected()) cancelHold(); });
    document.addEventListener('scroll', event => {
        lastScroll = performance.now(); cancelHold();
        if (sheet && !sheet.contains(event.target)) close();
    }, true);
    document.addEventListener('contextmenu', event => {
        const trigger = eligible(event.target);
        cancelHold();
        if (!trigger || document.querySelector('dialog[open]')) return;
        event.preventDefault();
        open(trigger, { x: event.clientX, y: event.clientY });
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && sheet) { event.preventDefault(); close(); return; }
        if (!(event.key === 'F10' && event.shiftKey) && event.key !== 'ContextMenu') return;
        const trigger = eligible(event.target);
        if (!trigger || document.querySelector('dialog[open]')) return;
        event.preventDefault();
        open(trigger);
    });
    const start = () => {
        new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
        enhance();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
