// Mobile-only progressive enhancement. Existing HTMX buttons remain the authority
// for actions/confirmations; this sheet never copies URLs or submits requests.
(() => {
    if (window.__hyperMobileMessage) return;
    window.__hyperMobileMessage = true;
    const mobile = window.matchMedia('(max-width: 700px), (max-width: 1023px) and (pointer: coarse)');
    let sheet = null;
    let origin = null;
    let source = null;
    let scheduled = false;
    const button = (text, attr) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.textContent = text;
        el.setAttribute(attr, '');
        el.dataset.noCopy = '';
        return el;
    };
    function close() {
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
    function open(trigger) {
        close();
        if (document.querySelector('dialog[open]')) return;
        const message = trigger.closest('[id^="m-"]');
        const actions = [...message.querySelectorAll('button[data-action="delete-one"], button[data-action="delete-from"]')];
        if (!actions.length) return;
        source = message;
        origin = trigger;
        sheet = document.createElement('dialog');
        sheet.className = 'mobile-message-sheet';
        sheet.setAttribute('aria-label', 'Действия с сообщением');
        const heading = document.createElement('h2');
        heading.textContent = 'Действия с сообщением';
        sheet.append(heading);
        const copyText = button('Копировать текст', 'data-mobile-message-copy');
        const copyStatus = document.createElement('span');
        copyStatus.setAttribute('role', 'status');
        copyStatus.setAttribute('aria-live', 'polite');
        copyText.addEventListener('click', async () => {
            const content = message.querySelector('.assistant .prose, .assistant, .chat-glass-primary, .whitespace-pre-wrap');
            if (!content) { copyStatus.textContent = 'Нет текста для копирования'; return; }
            const clean = content.cloneNode(true);
            clean.querySelectorAll('[data-no-copy], button, input, textarea, select, script, style, template, iframe, .tool, [data-tool], [data-author], [aria-hidden="true"], [role="tooltip"], [aria-label^="Gate:"], [aria-label^="Tools:"]').forEach(node => node.remove());
            clean.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
            clean.querySelectorAll('p, div, pre, li, h1, h2, h3, h4, blockquote, tr').forEach(node => node.append('\n'));
            try {
                await navigator.clipboard.writeText((clean.textContent || '').trim());
                copyStatus.textContent = 'Скопировано';
            } catch {
                copyStatus.textContent = 'Не удалось скопировать. Выделите текст вручную.';
            }
        });
        sheet.append(copyText, copyStatus);
        for (const action of actions) {
            const proxy = button(action.dataset.action === 'delete-one' ? 'Удалить сообщение' : 'Удалить начиная отсюда', 'data-mobile-sheet-action');
            proxy.dataset.danger = '';
            proxy.disabled = action.disabled;
            proxy.addEventListener('click', () => {
                close();
                // The original button retains hx-confirm, vals, target and all guards.
                if (action.isConnected && !action.disabled) action.click();
            });
            sheet.append(proxy);
        }
        const dismiss = button('Закрыть', 'data-mobile-sheet-close');
        dismiss.addEventListener('click', close);
        sheet.append(dismiss);
        sheet.addEventListener('cancel', event => { event.preventDefault(); close(); });
        const currentSheet = sheet;
        sheet.addEventListener('close', () => { if (sheet === currentSheet) close(); });
        sheet.addEventListener('click', event => {
            if (event.target !== sheet) return;
            const r = sheet.getBoundingClientRect();
            if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
        });
        document.body.append(sheet);
        sheet.showModal(); // Browser owns focus trapping and background inertness.
        dismiss.focus();
    }
    function enhance() {
        scheduled = false;
        if (sheet && (!mobile.matches || !source?.isConnected || [...document.querySelectorAll('dialog[open]')].some(dialog => dialog !== sheet))) close();
        if (!mobile.matches) return;
        const messages = document.querySelector('#messages');
        if (!messages) return;
        for (const message of messages.querySelectorAll('[id^="m-"]')) {
            if (!/^m-\d+$/.test(message.id) || message.parentElement.closest('[id^="m-"]')) continue;
            const actions = message.querySelectorAll('button[data-action="delete-one"], button[data-action="delete-from"]');
            if (!actions.length || message.querySelector('[data-mobile-message-actions]')) continue;
            message.classList.add('mobile-message-enhanced');
            const trigger = button('⋯', 'data-mobile-message-actions');
            trigger.setAttribute('aria-haspopup', 'dialog');
            trigger.setAttribute('aria-label', 'Действия с сообщением');
            message.append(trigger);
        }
        for (const pre of messages.querySelectorAll('.assistant pre')) {
            if (pre.dataset.mobileCode !== undefined) continue;
            const code = pre.querySelector('code');
            if (!code) continue;
            pre.dataset.mobileCode = '';
            pre.tabIndex = 0;
            pre.setAttribute('aria-label', 'Код, горизонтальная прокрутка');
            const tools = document.createElement('div');
            tools.className = 'mobile-code-tools';
            tools.dataset.noCopy = '';
            const copy = button('Копировать', 'data-mobile-code-copy');
            const status = document.createElement('span');
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            tools.append(copy, status);
            copy.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(code.textContent || '');
                    status.textContent = 'Скопировано';
                } catch {
                    status.textContent = 'Не удалось скопировать. Выделите код вручную.';
                }
            });
            if ((code.textContent || '').split('\n').length > 16) {
                pre.dataset.mobileCollapsed = 'true';
                const toggle = button('Развернуть код', 'data-mobile-code-toggle');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.addEventListener('click', () => {
                    const expanded = pre.dataset.mobileCollapsed === 'true';
                    pre.dataset.mobileCollapsed = String(!expanded);
                    toggle.setAttribute('aria-expanded', String(expanded));
                    toggle.textContent = expanded ? 'Свернуть код' : 'Развернуть код';
                });
                tools.append(toggle);
            }
            pre.before(tools);
        }
    }
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(enhance);
    }
    document.addEventListener('click', event => {
        const trigger = event.target.closest?.('[data-mobile-message-actions]');
        if (trigger && mobile.matches) open(trigger);
    });
    // This runtime uses colon-delimited HTMX lifecycle names. Size newly inserted
    // code before ChatController restores older-history anchors in its bubble listener.
    document.addEventListener('htmx:after:swap', enhance, true);
    document.addEventListener('htmx:after:process', enhance, true);
    document.addEventListener('htmx:before:swap', event => {
        const target = event.detail?.ctx?.target;
        if (sheet && (target === source || target?.contains?.(source))) close();
    });
    document.addEventListener('htmx:afterSwap', schedule);
    document.addEventListener('htmx:beforeCleanupElement', event => {
        if (sheet && (event.detail?.elt === source || event.detail?.elt?.contains(source))) close();
    });
    mobile.addEventListener('change', schedule);
    const start = () => {
        new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
        enhance();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
