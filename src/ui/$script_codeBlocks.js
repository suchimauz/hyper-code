// Shared chat code blocks on desktop and phones. Copy only source text, never
// toolbar labels or highlighted HTML; no secure-context requirement.
(() => {
  if (window.__hyperCodeBlocksInstalled) return;
  window.__hyperCodeBlocksInstalled = true;
  const legacyCopy = text => {
    const active = document.activeElement;
    const selection = window.getSelection();
    const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
    const field = document.createElement('textarea');
    field.value = text; field.readOnly = true; field.tabIndex = -1;
    field.setAttribute('aria-label', 'Копируемый код');
    field.style.cssText = 'position:fixed;top:0;left:-9999px;font-size:16px;opacity:0';
    // execCommand requires selection in the active dialog when one is modal.
    (document.querySelector('dialog[open]') || document.body).append(field);
    try {
      field.select(); field.setSelectionRange(0, text.length);
      if (typeof document.execCommand !== 'function' || !document.execCommand('copy')) throw Error('Copy unavailable');
    } finally {
      field.remove();
      if (active?.isConnected && !active.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) active.focus({ preventScroll: true });
      if (selection) { selection.removeAllRanges(); for (const range of ranges) if (range.commonAncestorContainer.isConnected) selection.addRange(range); }
    }
  };
  window.hyperCopyText = async text => {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return; }
      catch (error) { /* Permission denial can still allow the legacy copy gesture. */ }
    }
    legacyCopy(text);
  };
  const button = (text, attr) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.setAttribute(attr, ''); return node;
  };
  function enhance() {
    document.querySelectorAll('#messages .assistant pre').forEach(pre => {
      if (pre.closest('[data-chat-code-block]')) return;
      const code = pre.querySelector('code'); if (!code) return;
      const block = document.createElement('div'); block.className = 'chat-code-block'; block.dataset.chatCodeBlock = '';
      const tools = document.createElement('div'); tools.className = 'chat-code-tools'; tools.dataset.noCopy = '';
      const language = document.createElement('span'); language.className = 'chat-code-language';
      language.textContent = pre.dataset.codeLanguage || (code.className.match(/language-([\w+-]+)/) || [])[1] || 'Код';
      const copy = button('', 'data-code-copy'); copy.setAttribute('aria-label', 'Копировать код');
      copy.innerHTML = '<span class="chat-code-copy-label" aria-hidden="true">Копировать</span><span class="chat-code-copy-check" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg></span>';
      const status = document.createElement('span'); status.className = 'chat-code-status sr-only'; status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
      const feedback = document.createElement('div'); feedback.className = 'chat-code-feedback'; feedback.dataset.noCopy = ''; feedback.hidden = true;
      const errorText = document.createElement('span'); errorText.className = 'chat-code-error';
      const manual = button('Выделить код', 'data-code-select'); manual.hidden = true;
      let resetTimer;
      let copying = false;
      const resetCopy = () => { delete copy.dataset.copied; copy.setAttribute('aria-label', 'Копировать код'); };
      manual.addEventListener('click', () => {
        const range = document.createRange(); range.selectNodeContents(code);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        errorText.textContent = status.textContent = 'Код выделен. Выберите «Копировать» в меню браузера.';
      });
      copy.addEventListener('click', async () => {
        if (copying) return;
        copying = true;
        clearTimeout(resetTimer);
        status.textContent = '';
        try {
          await window.hyperCopyText(code.textContent || '');
          copy.dataset.copied = 'true'; copy.setAttribute('aria-label', 'Скопировано');
          status.textContent = 'Скопировано'; feedback.hidden = true; manual.hidden = true; errorText.textContent = '';
          resetTimer = setTimeout(() => { resetCopy(); status.textContent = ''; }, 2000);
        } catch (error) {
          resetCopy();
          errorText.textContent = status.textContent = 'Не удалось скопировать. Можно выделить код вручную.';
          feedback.hidden = false; manual.hidden = false;
        } finally {
          copying = false;
        }
      });
      tools.append(language, copy);
      const long = (code.textContent || '').split('\n').length > 16;
      if (long) {
        block.dataset.codeCollapsed = 'true';
        const toggle = button('Развернуть', 'data-code-toggle'); toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', () => {
          const expanded = block.dataset.codeCollapsed === 'true'; block.dataset.codeCollapsed = String(!expanded);
          toggle.setAttribute('aria-expanded', String(expanded)); toggle.textContent = expanded ? 'Свернуть' : 'Развернуть';
        });
        tools.append(toggle);
      }
      pre.tabIndex = 0; pre.setAttribute('aria-label', 'Код: ' + language.textContent + ', горизонтальная прокрутка');
      pre.before(block); block.append(tools, pre);
      status.dataset.noCopy = ''; feedback.append(errorText, manual); block.append(status, feedback);
    });
  }
  let scheduled = false;
  const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; enhance(); }); } };
  for (const name of ['htmx:after:swap', 'htmx:after:process', 'htmx:afterSwap']) document.addEventListener(name, enhance, true);
  const start = () => { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); enhance(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
