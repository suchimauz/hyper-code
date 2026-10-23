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
      const copy = button('Копировать', 'data-code-copy'); copy.setAttribute('aria-label', 'Копировать код');
      const status = document.createElement('span'); status.className = 'chat-code-status'; status.setAttribute('role', 'status');
      const manual = button('Выделить код', 'data-code-select'); manual.hidden = true;
      manual.addEventListener('click', () => {
        const range = document.createRange(); range.selectNodeContents(code);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        status.textContent = 'Код выделен. Выберите «Копировать» в меню браузера.';
      });
      copy.addEventListener('click', async () => {
        try {
          await window.hyperCopyText(code.textContent || '');
          status.textContent = 'Скопировано'; copy.textContent = 'Скопировано'; manual.hidden = true;
          setTimeout(() => { if (copy.isConnected) { copy.textContent = 'Копировать'; status.textContent = ''; } }, 2000);
        } catch (error) {
          status.textContent = 'Не удалось скопировать. Можно выделить код вручную.'; manual.hidden = false;
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
      const feedback = document.createElement('div'); feedback.className = 'chat-code-feedback'; feedback.dataset.noCopy = ''; feedback.append(status, manual); block.append(feedback);
    });
  }
  let scheduled = false;
  const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; enhance(); }); } };
  for (const name of ['htmx:after:swap', 'htmx:after:process', 'htmx:afterSwap']) document.addEventListener(name, enhance, true);
  const start = () => { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); enhance(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
