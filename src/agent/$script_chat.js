// One disposable controller per #chat-panel. HTMX owns markup; this controller
// owns only local interaction (scroll anchoring, composer keys and lazy tools).
(() => {
    if (window.__hyperChatControllerInstalled) return;
    window.__hyperChatControllerInstalled = true;

    const STICKY_BOTTOM_PX = 48;
    let current = null;
    // Per-browser-tab drafts survive HTMX navigation and reloads, without sending
    // unfinished messages to the server. Memory remains usable if storage is blocked.
    const drafts = new Map();
    const pendingSends = new WeakMap();
    // File objects and failed snapshots stay in memory only, never sessionStorage.
    const deliveries = new Map();
    const optimisticMessages = new Map();
    const draftFiles = new Map();
    const draftKey = form => 'hyper:chat-draft:v1:' + new URL(form.getAttribute('hx-post'), location.href).pathname;
    function readDraft(key) {
        if (drafts.has(key)) return drafts.get(key);
        try { const value = JSON.parse(sessionStorage.getItem(key) || 'null'); drafts.set(key, value); return value; }
        catch (error) { console.debug('Chat draft storage unavailable', error); return null; }
    }
    function writeDraft(key, value) {
        drafts.set(key, value);
        try { if (value?.text) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key); }
        catch (error) { console.debug('Chat draft storage unavailable', error); }
    }

    class ChatController {
        constructor(panel) {
            this.panel = panel;
            this.messages = panel.querySelector('#messages');
            this.form = panel.querySelector('#form');
            this.input = panel.querySelector('#input');
            this.agentId = this.messages?.dataset.agentId || panel.dataset.agentId || '';
            this.fileInput = panel.querySelector('#files');
            this.attachButton = panel.querySelector('[data-attach-button]');
            this.attachmentTray = panel.querySelector('[data-attachments]');
            this.inheritedCount = Number(this.messages?.dataset.inheritedCount || 0);
            this.abort = new AbortController();
            this.shouldStick = true;
            this.historyAnchor = null;
            this.historyAnchorTop = null;
            this.loadingOlder = false;
            this.ownSwaps = new WeakSet();
            this.submitting = false;
            this.lastAssistant = this.latestAssistant();
            this.latestMessageIndex = this.messageIndices().reduce((max, idx) => Math.max(max, idx), -1);
            this.pendingMessageIndices = new Set();
            this.jumpButton = panel.querySelector('[data-chat-jump]');
            this.jumpCount = panel.querySelector('[data-chat-jump-count]');
            this.jumpStatus = panel.querySelector('[data-chat-jump-status]');
        }

        // The composer grows with what is typed (up to 40vh, then scrolls). CSS field-sizing does it where
        // supported; elsewhere set the height from the content.
        fit() {
            this.updateSendAvailability();
            if (!this.input || CSS.supports?.('field-sizing', 'content')) return;
            this.input.style.height = 'auto';
            this.input.style.height = this.input.scrollHeight + 'px';
        }

        // Safari/WKWebView can leave 100dvh unchanged behind the software keyboard.
        // Fit only mobile chats to the visible viewport; never counteract pinch zoom.
        syncViewport() {
            const root = document.documentElement;
            const viewport = window.visualViewport;
            const mobile = window.matchMedia('(max-width: 700px)').matches
                || (window.matchMedia('(max-width: 1023px)').matches && window.matchMedia('(pointer: coarse)').matches);
            if (!mobile || !viewport) {
                this.clearViewport();
                return;
            }
            if (Math.abs(viewport.scale - 1) > 0.01 || viewport.height <= 0) return;
            const height = viewport.height + 'px';
            this.keyboardBaseline = Math.max(this.keyboardBaseline || 0, window.innerHeight, viewport.height);
            const editing = document.activeElement === this.input
                && this.keyboardBaseline - viewport.height > Math.max(150, this.keyboardBaseline * .18);
            this.panel.toggleAttribute('data-chat-editing', editing);
            const top = Math.max(0, viewport.offsetTop) + 'px';
            if (root.style.getPropertyValue('--chat-viewport-height') === height
                && root.style.getPropertyValue('--chat-viewport-top') === top) return;
            const atBottom = this.isNearBottom();
            const scrollTop = this.messages.scrollTop;
            this.viewportResizing = true;
            root.dataset.chatViewport = '';
            root.style.setProperty('--chat-viewport-height', height);
            root.style.setProperty('--chat-viewport-top', top);
            // Only a reader already at the bottom follows the keyboard. Reading
            // history must not jump to the newest message or opt into live scrolling.
            if (atBottom) this.scrollBottom();
            else this.messages.scrollTop = scrollTop;
            cancelAnimationFrame(this.viewportSettleFrame);
            this.viewportSettleFrame = requestAnimationFrame(() => { this.viewportResizing = false; });
        }

        clearViewport() {
            this.panel.removeAttribute('data-chat-editing');
            delete document.documentElement.dataset.chatViewport;
            document.documentElement.style.removeProperty('--chat-viewport-height');
            document.documentElement.style.removeProperty('--chat-viewport-top');
        }

        watchViewport() {
            const { signal } = this.abort;
            const schedule = () => {
                cancelAnimationFrame(this.viewportFrame);
                this.viewportFrame = requestAnimationFrame(() => {
                    if (this.alive()) this.syncViewport();
                });
            };
            window.visualViewport?.addEventListener('resize', schedule, { passive: true, signal });
            window.visualViewport?.addEventListener('scroll', schedule, { passive: true, signal });
            window.addEventListener('resize', schedule, { passive: true, signal });
            window.addEventListener('pageshow', schedule, { signal });
            this.input.addEventListener('focus', schedule, { signal });
            this.input.addEventListener('blur', () => { this.panel.removeAttribute('data-chat-editing'); schedule(); }, { signal });
            window.addEventListener('orientationchange', () => {
                this.keyboardBaseline = 0;
                this.panel.removeAttribute('data-chat-editing');
                schedule();
            }, { signal });
            this.syncViewport();
        }


        mount() {
            if (!this.messages || !this.form || !this.input) return false;
            const { signal } = this.abort;
            this.draftKey = draftKey(this.form);
            this.setFiles(draftFiles.get(this.draftKey) || []);
            const retrySend = () => {
                const sent = deliveries.get(this.draftKey);
                if (!sent || sent.inFlight || navigator.onLine === false) return;
                this.retrying = true;
                try { this.form.requestSubmit(); } finally { this.retrying = false; }
            };
            this.form.querySelector('[data-chat-retry]')?.addEventListener('click', retrySend, { signal });
            this.messages.addEventListener('click', event => {
                const retry = event.target.closest('[data-local-retry]');
                if (!retry || !this.messages.contains(retry)) return;
                if (retry.closest('[data-local-message]')?.dataset.localMessage !== deliveries.get(this.draftKey)?.requestId) return;
                retrySend();
            }, { signal });
            this.form.querySelector('[data-chat-cancel-retry]')?.addEventListener('click', () => {
                const sent = deliveries.get(this.draftKey);
                if (!sent || sent.inFlight) return;
                if (sent.attempted && !window.confirm('Сообщение могло уже сохраниться. Не повторять его? Перед новой отправкой проверьте историю чата. Текущий черновик останется здесь.')) return;
                deliveries.delete(this.draftKey);
                optimisticMessages.delete(sent.requestId);
                const key = this.form.elements.requestId;
                if (key) key.value = '';
                this.renderDelivery();
            }, { signal });
            window.addEventListener('online', () => this.renderDelivery(), { signal });
            window.addEventListener('offline', () => this.renderDelivery(), { signal });
            this.renderDelivery();
            this.renderAttachments();
            const saved = readDraft(this.draftKey);
            if (saved?.text && !this.input.value) {
                this.input.value = saved.text;
                this.input.setSelectionRange(saved.start ?? saved.text.length, saved.end ?? saved.text.length);
            }
            this.fit();
            if (this.touchComposer()) this.input.title = 'Enter — новая строка · Кнопка ↑ — отправить';
            this.watchViewport();
            this.jumpButton?.addEventListener('click', () => {
                // This explicit action opts back into the live edge, without submitting
                // the draft or focusing the textarea (which would reopen the keyboard).
                this.shouldStick = true;
                this.scrollBottom();
            }, { signal });
            if (typeof ResizeObserver !== 'undefined') {
                this.jumpResizeObserver = new ResizeObserver(() => this.scheduleJumpUpdate());
                this.jumpResizeObserver.observe(this.messages);
                this.jumpResizeObserver.observe(this.form);
            }
            const settingsToggle = this.form.querySelector('[data-composer-settings-toggle]');
            const settings = this.form.querySelector('[data-composer-settings]');
            if (settingsToggle && settings) {
                const setSettingsOpen = open => {
                    const atBottom = this.isNearBottom();
                    settings.toggleAttribute('data-open', open);
                    settingsToggle.setAttribute('aria-expanded', String(open));
                    if (atBottom) requestAnimationFrame(() => { if (this.alive()) this.scrollBottom(); });
                };
                // Without this controller the real controls remain visible as a fallback.
                this.form.setAttribute('data-composer-settings-ready', '');
                settingsToggle.addEventListener('click', () => setSettingsOpen(!settings.hasAttribute('data-open')), { signal });
                // Return to the compact compose view when the person starts typing.
                this.input.addEventListener('focus', () => { if (settings.hasAttribute('data-open')) setSettingsOpen(false); }, { signal });
            }
            this.messages.addEventListener('scroll', () => {
                if (this.viewportResizing) return;
                // Once the reader leaves the live edge, background swaps must
                // never reclaim the scroll position. Only an explicit send can
                // opt back into automatic positioning.
                if (!this.isNearBottom()) this.shouldStick = false;
                this.updateJumpButton();
                if (this.messages.scrollTop < 80) this.loadOlder();
            }, { passive: true, signal });
            // @mentions: typing @ suggests people; the list owns arrows/Enter/Tab/Esc while open.
            this.input.addEventListener('input', () => { this.saveDraft(); this.mentionUpdate(); this.fit(); }, { signal });
            this.input.addEventListener('blur', () => setTimeout(() => this.mentionClose(), 150), { signal });
            this.input.addEventListener('keydown', (event) => {
                if (event.isComposing || event.key === 'Process') return;
                // A phone's Return key is always text entry, even while @mentions are open.
                // Let the textarea insert its native newline; only the explicit send button submits.
                if (event.key === 'Enter' && this.touchComposer()) { this.mentionClose(); return; }
                if (this.mentionKey(event)) return;
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (!this.input.value.trim() && !this.fileInput?.files?.length) return;
                    this.form.requestSubmit();
                }
            }, { signal });
            // Copying a piece of the chat copies what was said, not the controls
            // around it: message buttons (Delete message, Delete from here…),
            // their screen-reader labels, icons and tool chips stay out.
            this.messages.addEventListener('copy', event => this.copyClean(event), { signal });
            this.attachButton?.addEventListener('click', () => this.fileInput?.click(), { signal });
            this.fileInput?.addEventListener('change', () => this.renderAttachments(), { signal });
            this.input.addEventListener('paste', event => {
                const files = [...(event.clipboardData?.items || [])].filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
                if (!files.length) return;
                event.preventDefault();
                const text = event.clipboardData?.getData('text/plain') || '';
                if (text) this.insertText(text);
                this.addFiles(files);
            }, { signal });
            this.form.addEventListener('dragover', event => { event.preventDefault(); this.form.classList.add('ring-2', 'ring-primary/40'); }, { signal });
            this.form.addEventListener('dragleave', event => { if (!this.form.contains(event.relatedTarget)) this.form.classList.remove('ring-2', 'ring-primary/40'); }, { signal });
            this.form.addEventListener('drop', event => { event.preventDefault(); this.form.classList.remove('ring-2', 'ring-primary/40'); this.addFiles([...(event.dataTransfer?.files || [])]); }, { signal });
            this.form.addEventListener('submit', event => {
                const previous = deliveries.get(this.draftKey);
                const reject = () => { event.preventDefault(); event.stopImmediatePropagation(); };
                if (this.submitting || previous?.inFlight) return reject();
                if (previous && !this.retrying) { this.renderDelivery(); return reject(); }
                if (!this.retrying && (!this.input.value.trim() && !this.fileInput?.files?.length)) return reject();
                this.saveDraft();
                const sent = previous || { key: this.draftKey, text: this.input.value, files: [...(this.fileInput?.files || [])], requestId: crypto.randomUUID() };
                deliveries.set(this.draftKey, sent);
                optimisticMessages.set(sent.requestId, sent);
                if (navigator.onLine === false) { sent.error = 'Нет соединения. Отправка не началась.'; this.renderDelivery(); return reject(); }
                sent.inFlight = true;
                sent.attempted = true;
                sent.error = '';
                this.submitting = true;
                pendingSends.set(this.form, sent);
                const requestId = this.form.elements.requestId;
                if (requestId) requestId.value = sent.requestId;
                this.shouldStick = true;
                this.renderDelivery();
                this.scrollBottom();
            }, { signal, capture: true });
            // Keep completion handling on this form even after navigation disposes
            // the controller; detached forms no longer bubble events to document.
            this.form.addEventListener('htmx:config:request', event => {
                const ctx = event.detail?.ctx;
                const sent = pendingSends.get(this.form);
                if (ctx?.sourceElement !== this.form || !sent) return;
                const body = ctx.request.body;
                body.set('text', sent.text);
                body.set('requestId', sent.requestId);
                body.delete('files'); body.delete('file');
                for (const file of sent.files) body.append('files', file, file.name);
            }, { signal });
            this.form.addEventListener('htmx:after:request', finishSend, true);
            this.form.addEventListener('htmx:error', finishSend, true);
            this.form.addEventListener('htmx:finally:request', finishSend, true);
            this.form.addEventListener('htmx:after:request', event => {
                const ctx = event.detail?.ctx;
                if (ctx?.sourceElement !== this.form) return;
                this.submitting = false;
                if (!(ctx?.response?.status >= 200 && ctx.response.status < 300)) return;
                const requestId = this.form.elements.requestId;
                if (requestId) requestId.value = '';
                this.shouldStick = true;
                this.scrollBottom();
                this.renderAttachments();
                this.fit();
                requestAnimationFrame(() => { if (this.alive() && this.shouldStick) this.scrollBottom(); });
            }, { signal });
            this.messages.addEventListener('click', event => {
                const toggle = event.target.closest('.tool-tray-toggle');
                if (!toggle || !this.messages.contains(toggle)) return;
                event.preventDefault();
                this.toggleTray(toggle.closest('.tool-tray'));
            }, { signal });
            this.arrangeTools(this.messages);
            this.prepareTables();
            this.addInheritedNote();
            document.body.dataset.agentId = this.agentId;
            requestAnimationFrame(() => {
                if (!this.alive()) return;
                if (this.jumpToHash()) return;
                this.scrollBottom();
                this.shouldStick = this.isNearBottom();
                // Opening a conversation on a phone should not summon the keyboard.
                if (!window.matchMedia('(pointer: coarse)').matches) this.input.focus({ preventScroll: true });
            });
            return true;
        }


        async mentionPeople() {
            if (!this.peoplePromise) this.peoplePromise = fetch('/mentions/people', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []);
            return this.peoplePromise;
        }

        // The @word being typed right before the caret, or null.
        mentionQuery() {
            const caret = this.input.selectionStart;
            if (caret !== this.input.selectionEnd) return null;
            const m = /(^|[^\w@.\/-])@([a-z0-9-]{0,64})$/i.exec(this.input.value.slice(0, caret));
            return m ? { start: caret - m[2].length - 1, query: m[2].toLowerCase() } : null;
        }

        async mentionUpdate() {
            const at = this.mentionQuery();
            if (!at) return this.mentionClose();
            const people = await this.mentionPeople();
            if (this.mentionQuery()?.start !== at.start) return;
            const q = at.query;
            const words = p => [p.id, p.name, p.email || ''].join(' ').toLowerCase();
            const list = people
                .filter(p => !q || words(p).split(/[\s@.-]+/).some(w => w.startsWith(q)) || p.id.startsWith(q))
                .slice(0, 8);
            if (!list.length) return this.mentionClose();
            this.mention = { start: at.start, list, sel: Math.min(this.mention?.sel ?? 0, list.length - 1) };
            this.mentionRender();
        }

        mentionRender() {
            let box = this.mentionBox;
            if (!box) {
                box = this.mentionBox = document.createElement('div');
                box.setAttribute('role', 'listbox');
                box.setAttribute('aria-label', 'Mention someone');
                box.dataset.mentionList = '';
                box.className = 'absolute bottom-full left-0 z-30 mb-2 w-72 max-w-full overflow-hidden rounded-xl border border-ui-border bg-base-100 p-1 text-base-content shadow-xl';
                box.addEventListener('mousedown', event => {
                    const row = event.target.closest('[data-mention-id]');
                    if (!row) return;
                    event.preventDefault();
                    this.mentionPick(row.dataset.mentionId);
                });
                (this.input.parentElement || this.form).append(box);
            }
            const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
            box.innerHTML = this.mention.list.map((p, i) => {
                const face = p.picture
                    ? `<img src="${esc(p.picture)}" alt="" class="size-6 shrink-0 rounded-full object-cover" referrerpolicy="no-referrer">`
                    : `<span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-base-300 text-3xs font-semibold">${esc((p.name || p.id).slice(0, 1).toUpperCase())}</span>`;
                return `<div role="option" aria-selected="${i === this.mention.sel}" data-mention-id="${esc(p.id)}" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${i === this.mention.sel ? 'bg-base-200' : 'hover:bg-base-200/60'}">${face}<span class="min-w-0 flex-1"><span class="block truncate text-xs font-medium">${esc(p.name)}</span><span class="block truncate text-3xs text-faint">@${esc(p.id)}${p.email ? ' · ' + esc(p.email) : ''}</span></span></div>`;
            }).join('');
            box.hidden = false;
        }

        mentionKey(event) {
            if (!this.mention || !this.mentionBox || this.mentionBox.hidden) return false;
            const n = this.mention.list.length;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                this.mention.sel = (this.mention.sel + (event.key === 'ArrowDown' ? 1 : -1) + n) % n;
                this.mentionRender();
                return true;
            }
            if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
                event.preventDefault();
                this.mentionPick(this.mention.list[this.mention.sel].id);
                return true;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                this.mentionClose();
                return true;
            }
            return false;
        }

        mentionPick(id) {
            if (!this.mention) return;
            const start = this.mention.start, end = this.input.selectionStart;
            this.input.setRangeText('@' + id + ' ', start, end, 'end');
            this.mentionClose();
            this.input.focus();
            this.input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        mentionClose() {
            this.mention = null;
            if (this.mentionBox) this.mentionBox.hidden = true;
        }

        insertText(text) {
            const start = this.input.selectionStart, end = this.input.selectionEnd;
            this.input.setRangeText(text, start, end, 'end');
            this.input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        addFiles(files) {
            if (!this.fileInput || !files.length) return;
            const dt = new DataTransfer();
            for (const file of [...(this.fileInput.files || []), ...files].slice(0, 10)) dt.items.add(file);
            this.fileInput.files = dt.files;
            this.renderAttachments();
        }

        removeFile(index) {
            const dt = new DataTransfer();
            [...(this.fileInput?.files || [])].forEach((file, i) => { if (i !== index) dt.items.add(file); });
            this.fileInput.files = dt.files;
            this.renderAttachments();
        }

        clearAttachmentPreviews() {
            this.closeAttachmentPreview(false);
            for (const url of this.attachmentURLs || []) URL.revokeObjectURL(url);
            this.attachmentURLs = [];
        }

        closeAttachmentPreview(restoreFocus = true) {
            const preview = this.attachmentPreview;
            if (!preview) return;
            this.attachmentPreview = null;
            if (preview.dialog.open) preview.dialog.close();
            preview.dialog.remove();
            if (restoreFocus && preview.trigger.isConnected) preview.trigger.focus({ preventScroll: true });
        }

        openAttachmentPreview(file, url, trigger) {
            this.closeAttachmentPreview(false);
            const dialog = document.createElement('dialog');
            dialog.className = 'chat-attachment-preview';
            dialog.setAttribute('aria-label', 'Предпросмотр изображения: ' + file.name);
            const close = document.createElement('button');
            close.type = 'button'; close.className = 'chat-attachment-preview-close';
            close.textContent = 'Закрыть'; close.setAttribute('aria-label', 'Закрыть предпросмотр');
            const image = document.createElement('img'); image.src = url; image.alt = file.name;
            dialog.append(close, image);
            const dismiss = () => this.closeAttachmentPreview();
            close.addEventListener('click', dismiss);
            dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
            dialog.addEventListener('close', () => { if (this.attachmentPreview?.dialog === dialog) dismiss(); });
            dialog.addEventListener('click', event => { if (event.target === dialog) dismiss(); });
            this.attachmentPreview = { dialog, trigger };
            document.body.append(dialog);
            dialog.showModal();
            close.focus({ preventScroll: true });
        }

        renderAttachments() {
            this.updateSendAvailability();
            this.clearAttachmentPreviews();
            if (!this.attachmentTray || !this.fileInput) return;
            const files = [...(this.fileInput.files || [])];
            this.attachmentTray.replaceChildren();
            this.attachmentTray.classList.toggle('hidden', files.length === 0);
            this.attachmentTray.classList.toggle('flex', files.length > 0);
            files.forEach((file, index) => {
                const chip = document.createElement('div');
                chip.className = 'chat-attachment-card flex max-w-56 items-center gap-2 rounded-lg border border-ui-border bg-base-100 px-2 py-1.5 text-xs';
                if (file.type.startsWith('image/')) {
                    const url = URL.createObjectURL(file); this.attachmentURLs.push(url);
                    const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'chat-attachment-thumbnail';
                    preview.setAttribute('aria-label', 'Предпросмотр: ' + file.name);
                    const img = document.createElement('img'); img.className = 'size-9 rounded object-cover'; img.src = url; img.alt = '';
                    preview.append(img); preview.addEventListener('click', () => this.openAttachmentPreview(file, url, preview)); chip.append(preview);
                } else { const icon = document.createElement('i'); icon.className = 'ph ph-file text-faint'; icon.setAttribute('aria-hidden', 'true'); chip.append(icon); }
                const details = document.createElement('span'); details.className = 'chat-attachment-details min-w-0 flex-1';
                const name = document.createElement('span'); name.className = 'block truncate'; name.textContent = file.name; name.title = file.name;
                const size = document.createElement('span'); size.className = 'chat-attachment-size text-faint';
                size.textContent = file.size < 1024 ? file.size + ' B' : file.size < 1048576 ? (file.size / 1024).toFixed(1) + ' KB' : (file.size / 1048576).toFixed(1) + ' MB';
                details.append(name, size); chip.append(details);
                const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'chat-attachment-remove text-faint hover:text-error';
                remove.setAttribute('aria-label', 'Удалить файл: ' + file.name); remove.textContent = '×';
                remove.addEventListener('click', () => { this.removeFile(index); const next = this.attachmentTray.querySelectorAll('.chat-attachment-remove'); (next[Math.min(index, next.length - 1)] || this.attachButton || this.input)?.focus({ preventScroll: true }); }); chip.append(remove);
                this.attachmentTray.append(chip);
            });
        }
        updateSendAvailability() {
            if (!this.form || !this.input) return;
            this.form.setAttribute('data-composer-send-ready', '');
            this.form.toggleAttribute('data-composer-has-content', Boolean(this.input.value.trim() || this.fileInput?.files?.length));
        }
        touchComposer() { return window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && window.innerWidth <= 1023); }
        alive() { return current === this && this.panel.isConnected && !this.abort.signal.aborted; }
        isNearBottom() { return this.messages.scrollHeight - this.messages.scrollTop - this.messages.clientHeight <= STICKY_BOTTOM_PX; }
        scrollBottom() {
            this.messages.scrollTop = this.messages.scrollHeight;
            this.pendingMessageIndices.clear();
            this.updateJumpButton();
        }
        messageIndices() {
            // Only top-level rendered conversation messages have m-<event index> IDs.
            // Never count tool cards, status polls, or markup nested inside a message.
            return [...(this.messages?.children || [])].flatMap(element => {
                const match = /^m-(\d+)$/.exec(element.id);
                return match ? [Number(match[1])] : [];
            });
        }
        collectNewMessages(countNew) {
            const indices = this.messageIndices();
            if (countNew) for (const idx of indices) {
                if (idx > this.latestMessageIndex) this.pendingMessageIndices.add(idx);
            }
            for (const idx of indices) this.latestMessageIndex = Math.max(this.latestMessageIndex, idx);
            // A message removed by an explicit transcript action is not still pending.
            const present = new Set(indices);
            for (const idx of this.pendingMessageIndices) if (!present.has(idx)) this.pendingMessageIndices.delete(idx);
        }
        updateJumpButton() {
            if (!this.jumpButton || !this.alive()) return;
            const nearBottom = this.isNearBottom();
            if (nearBottom) this.pendingMessageIndices.clear();
            const count = this.pendingMessageIndices.size;
            this.jumpButton.hidden = nearBottom;
            if (this.jumpCount) {
                this.jumpCount.hidden = !count;
                this.jumpCount.textContent = count > 99 ? '99+' : String(count);
            }
            const status = count ? `Новых сообщений: ${count}` : '';
            this.jumpButton.setAttribute('aria-label', 'К последнему сообщению' + (status ? '. ' + status : ''));
            // Announce changed counts only, not every scroll tick or tool refresh.
            if (this.jumpStatus && this.jumpStatus.textContent !== status) this.jumpStatus.textContent = status;
        }
        scheduleJumpUpdate() {
            cancelAnimationFrame(this.jumpFrame);
            this.jumpFrame = requestAnimationFrame(() => { if (this.alive()) this.updateJumpButton(); });
        }

        latestAssistant() {
            const items = this.messages.querySelectorAll('.assistant');
            return items[items.length - 1] || null;
        }

        scrollAssistantTop(element) {
            const messagesTop = this.messages.getBoundingClientRect().top;
            const elementTop = element.getBoundingClientRect().top;
            this.messages.scrollTop += elementTop - messagesTop - 12;
        }
        addInheritedNote() {
            if (this.inheritedCount <= 0 || this.messages.querySelector('[data-inherited]')) return;
            const note = document.createElement('div');
            note.className = 'bg-base-200 text-subtle italic rounded-lg px-4 py-3';
            note.dataset.inherited = '1';
            note.textContent = `inherited context: ${this.inheritedCount} msgs`;
            this.messages.prepend(note);
        }

        // /agent/<id>#m-<idx> (a mention link) opens the chat at that message: older pages are loaded
        // until it is in the DOM, then it is scrolled to the middle and flashed.
        jumpToHash() {
            const m = /^#m-(\d+)$/.exec(location.hash);
            if (!m) { this.jumpTarget = null; return false; }
            const el = this.messages.querySelector('#m-' + m[1]);
            if (el) {
                this.jumpTarget = null;
                this.shouldStick = false;
                el.scrollIntoView({ block: 'center' });
                el.classList.add('ring-2', 'ring-primary/60', 'rounded-2xl');
                setTimeout(() => el.classList.remove('ring-2', 'ring-primary/60', 'rounded-2xl'), 2500);
                history.replaceState(history.state, '', location.pathname + location.search);
                return true;
            }
            if (this.jumpTarget === m[1] && !this.messages.querySelector('#msg-head')) { this.jumpTarget = null; return false; }
            this.jumpTarget = m[1];
            const head = this.messages.querySelector('#msg-head');
            if (!head) { this.jumpTarget = null; return false; }
            this.shouldStick = false;
            this.loadingOlder = true;
            htmx.trigger(head, 'load-older');
            return true;
        }

        loadOlder() {
            const head = this.messages.querySelector('#msg-head');
            if (!head || this.loadingOlder) return;
            this.loadingOlder = true;
            this.historyAnchor = head.nextElementSibling;
            this.historyAnchorTop = this.historyAnchor?.getBoundingClientRect().top ?? null;
            htmx.trigger(head, 'load-older');
        }

        beforeSwap(event) {
            const target = event.detail?.ctx?.target;
            const source = event.detail?.ctx?.sourceElement;
            // Ignore late HTMX responses from a chat that has already been
            // replaced by navigation to another agent.
            if (!(target && (target === this.messages || this.panel.contains(target)))
                && !(source && this.panel.contains(source))) return;
            if (target) this.ownSwaps.add(target);
            // Do not infer consent to autoscroll from geometry here: a live
            // fragment can update while the reader happens to be near the end.
            if (target?.id === 'msg-head' && this.messages.contains(target)) {
                this.historyAnchor = target.nextElementSibling;
                this.historyAnchorTop = this.historyAnchor?.getBoundingClientRect().top ?? null;
                this.loadingOlder = true;
            }
        }

        afterSwap(event) {
            if (!this.alive()) return;
            const target = event.detail?.ctx?.target;
            const source = event.detail?.ctx?.sourceElement;
            const belongsHere = (target && (this.ownSwaps.has(target) || target === this.messages || this.panel.contains(target)))
                || (source && this.panel.contains(source));
            if (!belongsHere) return;
            // Size new tables before preserving the history anchor or positioning an answer.
            this.prepareTables();
            const wasFollowing = this.shouldStick;
            const latestAssistant = this.latestAssistant();
            const hasNewAssistant = latestAssistant && latestAssistant !== this.lastAssistant
                && (!latestAssistant.closest('[id^="m-"]')?.id || latestAssistant.closest('[id^="m-"]')?.id !== this.lastAssistant?.closest('[id^="m-"]')?.id);
            if (hasNewAssistant && this.shouldStick) {
                this.lastAssistant = latestAssistant;
                this.scrollAssistantTop(latestAssistant);
                this.shouldStick = false;
            } else {
                if (hasNewAssistant) this.lastAssistant = latestAssistant;
                if ((target === this.messages || target?.id === 'msg-tail') && this.shouldStick) this.scrollBottom();
            }
            if (target?.id === 'msg-head') {
                if (this.historyAnchor?.isConnected && this.historyAnchorTop != null) {
                    const drift = this.historyAnchor.getBoundingClientRect().top - this.historyAnchorTop;
                    if (Math.abs(drift) > 0.5) this.messages.scrollTop += drift;
                }
                this.historyAnchor = null;
                this.historyAnchorTop = null;
                this.loadingOlder = false;
                if (this.jumpTarget) this.jumpToHash();
            }
            if (target === this.messages || this.messages.contains(target) || target?.id === 'msg-tail' || target?.id === 'msg-head') {
                this.arrangeTools(this.messages);
            }
            this.renderOptimisticMessages();
            this.collectNewMessages(!wasFollowing && target?.id !== 'msg-head');
            this.updateJumpButton();
            this.scheduleJumpUpdate();
        }

        prepareTables() {
            // Move the original table, never clone/flatten it: links, selection, headers
            // and row relationships survive. Existing and paged-in answers use the same path.
            this.messages.querySelectorAll('.prose table').forEach(table => {
                if (table.parentElement?.closest('table') || table.parentElement?.classList.contains('chat-table-scroll')) return;
                const block = document.createElement('div');
                block.className = 'chat-table-block';
                const hint = document.createElement('div');
                hint.className = 'chat-table-hint';
                hint.setAttribute('data-no-copy', '');
                hint.setAttribute('aria-hidden', 'true');
                hint.textContent = 'Таблицу можно листать вбок ↔';
                const scroll = document.createElement('div');
                scroll.className = 'chat-table-scroll';
                scroll.setAttribute('role', 'region');
                scroll.setAttribute('aria-label', table.caption?.textContent?.trim() || 'Таблица — горизонтальная прокрутка');
                scroll.tabIndex = 0;
                table.before(block);
                block.append(hint, scroll);
                scroll.append(table);
            });
        }

        arrangeTools(root) {
            // The live chip is excluded: it is already a row member by way of
            // its region, and wrapping it would build a second row inside that
            // region instead of joining the one on screen.
            root?.querySelectorAll('.tool[data-tool]:not([data-tray-exit])').forEach(card => {
                if (!card.closest('#active-tool-call')) this.moveToTray(card);
            });
            // Placed before the rows are summarized: folding reads the row's
            // membership, so the region has to be in its final position first.
            this.placeActiveTool(root);
            root?.querySelectorAll('.tool-tray').forEach(tray => this.summarizeTray(tray));
        }

        // The running call belongs in the row its finished siblings are in: it
        // is the next chip in that row, and a line of its own would say it is a
        // different kind of thing. It also stops the transcript from twitching
        // — a dedicated line appears and disappears with every tool call.
        //
        // The live region is moved, never the chip inside it: htmx owns that
        // element by id, and lifting the chip out would leave the polling shell
        // behind, freezing the indicator at its first render.
        //
        // It is moved into the row unconditionally, empty or not. Parking an
        // empty region next to the row instead put a non-tray element between
        // two tool cards, and moveToTray starts a NEW row whenever the element
        // before a card is not a row — so the next chip opened a second line.
        // An empty region is already invisible (empty:hidden) and a flex item
        // of zero size changes no layout, so there is nothing to gain by
        // treating the two cases differently, and a race to lose.
        placeActiveTool(root) {
            const region = root?.querySelector('#active-tool-call');
            if (!region) return;
            const trays = [...root.querySelectorAll('.tool-tray')].filter(t => !region.contains(t));
            const tray = trays[trays.length - 1];
            // Before the first tool call of a session there is no row yet, so
            // the region stays where the server put it.
            if (!tray) return;
            if (region !== tray.lastElementChild) tray.appendChild(region);
        }

        // FLIP keeps wrapping rows spatially continuous in either direction.
        toggleTray(tray) {
            const nodes = [...tray.children];
            const before = new Map(nodes.map(node => [node, node.getBoundingClientRect()]));
            const oldHeight = tray.getBoundingClientRect().height;
            tray._toolAnimations?.forEach(animation => animation.cancel());
            tray._toolAnimations = [];
            tray.querySelectorAll('[data-tray-exit]').forEach(node => node.remove());
            tray.dataset.open = tray.dataset.open === '1' ? '0' : '1';
            this.summarizeTray(tray);
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !tray.animate) return;
            const bounds = tray.getBoundingClientRect();
            const timing = { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' };
            const animate = (node, frames, options = timing) => {
                const animation = node.animate(frames, options);
                tray._toolAnimations.push(animation);
                return animation;
            };
            animate(tray, [{ height: oldHeight + 'px' }, { height: bounds.height + 'px' }]);
            for (const node of nodes) {
                if (!node.isConnected || node.hasAttribute('data-tray-exit')) continue;
                const from = before.get(node), to = node.getBoundingClientRect();
                if (!to.width) {
                    if (!from.width) continue;
                    const ghost = node.cloneNode(true);
                    ghost.removeAttribute('id'); ghost.dataset.trayExit = ''; ghost.inert = true; ghost.setAttribute('aria-hidden', 'true');
                    ghost.style.cssText = `position:absolute;pointer-events:none;left:${from.left - bounds.left}px;top:${from.top - bounds.top}px;width:${from.width}px;height:${from.height}px;`;
                    tray.append(ghost);
                    const animation = animate(ghost,[{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-16px) scale(.8)' }], { ...timing, duration: 160 });
                    animation.finished.then(() => ghost.remove(), () => ghost.remove());
                    setTimeout(() => ghost.remove(), 200);
                } else {
                    const visible = from.width > 0;
                    animate(node, [{ transform: `translate(${visible ? from.left - to.left : -16}px,${visible ? from.top - to.top : 0}px)`, opacity: visible ? 1 : 0 }, { transform: 'translate(0,0)', opacity: 1 }], timing);
                }
            }
        }

        // Failed and running calls remain visible while older calls are folded.
        summarizeTray(tray) {
            const tools = [...tray.children].filter(node => node.matches('.tool[data-tool]:not([data-tray-exit])'));
            // Keep the last three calls on screen; older calls slide in from the left.
            tools.forEach((t, i) => {
                t.classList.toggle('tool-latest', i >= tools.length - 3);
                t.classList.toggle('tool-history', tools.length > 4 && i < tools.length - 3 && !t.classList.contains('text-error'));
            });
            let toggle = tray.querySelector(':scope > .tool-tray-toggle');
            if (tools.length <= 4) {
                toggle?.remove(); tray.classList.remove('tool-tray--folded');
                tools.forEach(tool => { tool.inert = false; tool.removeAttribute('aria-hidden'); });
                return;
            }
            if (!toggle) {
                toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'tool-tray-toggle';
                toggle.dataset.action = 'toggle-tools';

                tray.prepend(toggle);
            } else if (toggle !== tray.firstElementChild) tray.prepend(toggle);
            const open = tray.dataset.open === '1';
            const failed = tools.filter(t => /\btext-error\b/.test(t.className)).length;
            tray.classList.toggle('tool-tray--folded', !open);
            for (const tool of tools) {
                tool.inert = !open && tool.classList.contains('tool-history');
                if (tool.inert) tool.setAttribute('aria-hidden', 'true'); else tool.removeAttribute('aria-hidden');
            }
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', `${open ? 'Свернуть' : 'Показать'} вызовы инструментов: ${tools.length}${failed ? `, ошибок: ${failed}` : ''}`);
            toggle.innerHTML = `<i class="ph ph-caret-right" aria-hidden="true"></i><span>${tools.length}</span>${failed ? `<span class="text-error" aria-label="Ошибок: ${failed}">· ${failed}</span>` : ''}`;
        }

        moveToTray(card) {
            if (card.parentElement?.classList.contains('tool-tray')) return;
            // Walk back past the live region: it is a row member, not a wall
            // between two rows. Reading it as "not a row" is what used to start
            // a second line mid-sequence.
            let prev = card.previousElementSibling;
            if (prev?.id === 'active-tool-call') prev = prev.previousElementSibling;
            const tray = prev?.classList.contains('tool-tray') ? prev : document.createElement('div');
            if (!tray.isConnected) {
                tray.className = 'tool-tray';
                card.parentNode.insertBefore(tray, card);
            }
            tray.appendChild(card);
            const next = tray.nextElementSibling;
            if (next?.classList.contains('tool-tray')) {
                while (next.firstChild) tray.appendChild(next.firstChild);
                next.remove();
            }
        }


        copyClean(event) {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || !event.clipboardData) return;
            const holder = document.createElement('div');
            for (let i = 0; i < selection.rangeCount; i++) holder.append(selection.getRangeAt(i).cloneContents());
            const noise = 'button, [role="button"], .sr-only, i.ph, svg, input, select, textarea, form, [data-no-copy]';
            if (!holder.querySelector(noise)) return; // nothing to strip: let the browser copy as usual
            holder.querySelectorAll(noise).forEach(el => el.remove());
            // innerText needs layout to keep line breaks between blocks.
            holder.style.cssText = 'position:fixed;left:-99999px;top:0;white-space:pre-wrap';
            document.body.append(holder);
            const text = holder.innerText.replace(/\n{3,}/g, '\n\n').trim();
            const html = holder.innerHTML;
            holder.remove();
            event.preventDefault();
            event.clipboardData.setData('text/plain', text);
            event.clipboardData.setData('text/html', html);
        }

        setFiles(files) {
            if (!this.fileInput) return;
            const dt = new DataTransfer();
            for (const file of files) dt.items.add(file);
            this.fileInput.files = dt.files;
        }

        renderOptimisticMessages() {
            for (const [id, sent] of optimisticMessages) {
                if (sent.key !== this.draftKey) continue;
                let bubble = [...this.messages.querySelectorAll('[data-local-message]')].find(node => node.dataset.localMessage === id);
                if (Number.isInteger(sent.messageIdx) && this.messages.querySelector('#m-' + sent.messageIdx)) {
                    bubble?.remove(); optimisticMessages.delete(id); continue;
                }
                if (!bubble) {
                    bubble = document.createElement('div'); bubble.dataset.localMessage = id;
                    bubble.className = 'chat-local-message';
                    const body = document.createElement('div'); body.className = 'chat-glass-primary rounded-2xl rounded-br-md px-3.5 py-2 text-white whitespace-pre-wrap break-words';
                    const text = document.createElement('span'); text.dataset.localText = '';
                    const indicator = document.createElement('span'); indicator.dataset.localProgress = ''; indicator.setAttribute('role', 'img');
                    const retry = document.createElement('button'); retry.type = 'button'; retry.dataset.localRetry = ''; retry.textContent = 'Повторить';
                    body.append(text, indicator); bubble.append(body, retry);
                    const tail = this.messages.querySelector('#msg-tail');
                    if (tail) tail.before(bubble); else this.messages.append(bubble);
                }
                bubble.dataset.state = sent.inFlight ? 'pending' : sent.error ? 'failed' : 'confirmed';
                bubble.querySelector('[data-local-text]').textContent = sent.text + (sent.files.length ? '\n📎 ' + sent.files.map(file => file.name).join(', ') : '');
                const progress = bubble.querySelector('[data-local-progress]');
                progress.hidden = !sent.inFlight && !sent.error;
                progress.setAttribute('aria-label', sent.error ? 'Отправка не подтверждена' : 'Отправляется');
                progress.textContent = sent.error ? '!' : '';
                const retry = bubble.querySelector('[data-local-retry]');
                retry.hidden = !sent.error;
                retry.disabled = sent.inFlight || navigator.onLine === false;
            }
            for (const bubble of this.messages.querySelectorAll('[data-local-message]')) {
                if (!optimisticMessages.has(bubble.dataset.localMessage)) bubble.remove();
            }
        }

        renderDelivery() {
            const sent = deliveries.get(this.draftKey);
            this.submitting = Boolean(sent?.inFlight);
            this.form.toggleAttribute('data-chat-submitting', this.submitting);
            this.renderOptimisticMessages();
            for (const button of this.form.querySelectorAll('[data-composer-send]')) {
                if (this.submitting) { button.setAttribute('aria-busy', 'true'); button.setAttribute('aria-disabled', 'true'); }
                else { button.removeAttribute('aria-busy'); button.removeAttribute('aria-disabled'); }
            }
            this.form.toggleAttribute('data-chat-send-failed', Boolean(sent?.error));
            const offline = this.form.querySelector('[data-chat-network]');
            if (offline) offline.hidden = navigator.onLine !== false;
            const error = this.form.querySelector('[data-chat-send-error]');
            if (error) error.hidden = !sent?.error;
            const text = this.form.querySelector('[data-chat-send-error-text]');
            if (text) text.textContent = sent?.error ? sent.error + ' Повтор отправит прежний текст и файлы, не новый черновик. Файлы сохраняются только до перезагрузки страницы.' : '';
            const retry = this.form.querySelector('[data-chat-retry]');
            if (retry) retry.disabled = this.submitting || navigator.onLine === false;
            const cancel = this.form.querySelector('[data-chat-cancel-retry]');
            if (cancel) cancel.disabled = this.submitting;
        }

        saveDraft() {
            if (!this.draftKey || !this.input) return;
            draftFiles.set(this.draftKey, [...(this.fileInput?.files || [])]);
            writeDraft(this.draftKey, this.input.value ? { text: this.input.value, start: this.input.selectionStart, end: this.input.selectionEnd } : null);
        }

        destroy() {
            this.saveDraft();
            this.clearAttachmentPreviews();
            this.mentionBox?.remove();
            this.abort.abort();
            cancelAnimationFrame(this.viewportFrame);
            cancelAnimationFrame(this.viewportSettleFrame);
            cancelAnimationFrame(this.jumpFrame);
            this.jumpResizeObserver?.disconnect();
            this.clearViewport();
        }
    }

    function mount() {
        const panel = document.getElementById('chat-panel');
        if (!panel) { current?.destroy(); current = null; return; }
        if (current?.panel === panel) return;
        current?.destroy();
        const next = new ChatController(panel);
        current = next;
        if (!next.mount()) { next.destroy(); current = null; }
    }

    window.addEventListener('pagehide', () => { current?.saveDraft(); current?.clearAttachmentPreviews(); });
    window.addEventListener('pageshow', () => current?.renderAttachments());
    // Capture before local request handlers. A failed request must never erase a
    // draft; a successful older send must not erase text typed while it was pending.
    function finishSend(event) {
        const ctx = event.detail?.ctx;
        const form = ctx?.sourceElement;
        const sent = form && pendingSends.get(form);
        if (!sent) return;
        pendingSends.delete(form);
        sent.inFlight = false;
        if (!(ctx.response?.status >= 200 && ctx.response.status < 300)) {
            const status = ctx.response?.status;
            sent.error = status === 409 ? 'Прежняя отправка требует проверки истории чата (HTTP 409).' : status ? `Не удалось отправить (HTTP ${status}).` : 'Нет подтверждения отправки: соединение прервано или истекло время ожидания.';
            if (current?.draftKey === sent.key) current.renderDelivery();
            return;
        }
        deliveries.delete(sent.key);
        const confirm = result => {
            if (Number.isInteger(result?.messageIdx)) sent.messageIdx = result.messageIdx;
            if (current?.draftKey === sent.key) current.renderOptimisticMessages();
        };
        const payload = ctx.response;
        const confirmedIdx = payload?.headers?.get?.('x-chat-message-idx') ?? payload?.raw?.headers?.get?.('x-chat-message-idx');
        if (confirmedIdx != null && /^\d+$/.test(confirmedIdx)) confirm({ messageIdx: Number(confirmedIdx) });
        if (typeof ctx.text === 'string' && ctx.text.trim()) {
            try { confirm(JSON.parse(ctx.text)); } catch (error) { console.debug('Message confirmation unavailable', error); }
        }
        else if (payload?.clone) payload.clone().json().then(confirm).catch(error => console.debug('Message confirmation unavailable', error));
        else if (payload?.responseText) { try { confirm(JSON.parse(payload.responseText)); } catch (error) { console.debug('Message confirmation unavailable', error); } }
        draftFiles.set(sent.key, (draftFiles.get(sent.key) || []).filter(file => !sent.files.includes(file)));
        if (readDraft(sent.key)?.text === sent.text) writeDraft(sent.key, null);
        const input = form.querySelector('#input');
        if (input?.value === sent.text) {
            input.value = '';

        }
        if (current?.draftKey === sent.key) {
            if (current.input.value === sent.text) current.input.value = '';
            current.setFiles([...(current.fileInput?.files || [])].filter(file => !sent.files.includes(file)));
            current.saveDraft(); current.fit(); current.renderAttachments(); current.renderDelivery();
        }
    }
    document.addEventListener('htmx:before:cleanup', event => {
        const target = event.target;
        if (current && (target === current.panel || target?.contains?.(current.panel))) {
            current.destroy();
            current = null;
        }
    });
    document.addEventListener('htmx:before:swap', event => current?.beforeSwap(event));
    document.addEventListener('htmx:after:swap', event => {
        current?.afterSwap(event);
        mount();
    });
    mount();

})();
