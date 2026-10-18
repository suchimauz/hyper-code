// Full-history search is a separate native dialog: never replaces chat or composer nodes.
(function () {
  if (window.__chatSearchInstalled) return;
  window.__chatSearchInstalled = true;
  let active = null;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const speaker = role => role === 'user' ? 'Вы' : role === 'assistant' ? 'Ассистент' : 'Сообщение';
  function highlight(node, text, query) {
    node.replaceChildren();
    // Literal matching, no regex and no HTML interpolation from messages or query.
    const lower = text.toLowerCase(), needle = query.toLowerCase(); let start = 0, at;
    while (needle && (at = lower.indexOf(needle, start)) !== -1) {
      node.append(document.createTextNode(text.slice(start, at)), el('mark', text.slice(at, at + query.length)));
      start = at + query.length;
    }
    node.append(document.createTextNode(text.slice(start)));
  }
  function open(agentId, opener) {
    if (active) active();
    const focusBefore = document.activeElement, scrollX = window.scrollX, scrollY = window.scrollY;
    const popover = opener.closest('[data-chat-panel]');
    const returnFocus = popover?.id ? document.querySelector('[popovertarget="' + CSS.escape(popover.id) + '"]') : opener;
    if (popover?.matches(':popover-open')) popover.hidePopover();
    const messages = document.querySelector('#messages'), messageScroll = messages?.scrollTop;
    const dialog = el('dialog', '', 'chat-search-dialog');
    dialog.setAttribute('aria-label', 'Поиск по переписке');
    const header = el('header'), title = el('h2', 'Поиск по переписке'), close = el('button', 'Закрыть'); close.type = 'button';
    const form = el('form'), input = el('input'); input.type = 'search'; input.maxLength = 200; input.placeholder = 'Поиск по всей переписке'; input.setAttribute('aria-label', 'Поиск по всей переписке');
    const submit = el('button', 'Найти'); submit.type = 'submit';
    const status = el('p', 'Поиск по всем сохранённым сообщениям, включая историю родительского чата.', 'chat-search-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const navigation = el('nav'), prev = el('button', 'Предыдущий'), next = el('button', 'Следующий'); prev.type = next.type = 'button';
    const list = el('div', '', 'chat-search-results'), detail = el('article', '', 'chat-search-detail'); detail.setAttribute('aria-label', 'Фрагмент выбранного сообщения');
    header.append(title, close); form.append(input, submit); navigation.append(prev, next); dialog.append(header, form, status, navigation, list, detail); document.body.append(dialog);
    let controller = null, generation = 0, closed = false, query = '', rows = [], selected = -1, cursor = null, busy = false;
    function buttons() { prev.disabled = busy || selected <= 0; next.disabled = busy || !rows.length || (selected === rows.length - 1 && cursor === null); }
    function select(index) {
      if (index < 0 || index >= rows.length) return;
      selected = index; const row = rows[index];
      for (const [i, button] of Array.from(list.children).entries()) button.setAttribute('aria-current', String(i === index));
      detail.replaceChildren(el('h3', speaker(row.role) + ' · сообщение ' + (row.idx + 1)));
      const text = el('pre'); highlight(text, row.snippet, query); detail.append(text);
      if (row.truncated) detail.append(el('p', 'Показан фрагмент длинного сообщения.'));
      status.textContent = 'Результат ' + (index + 1) + ' из ' + rows.length + (cursor !== null ? '+' : '');
      list.children[index]?.scrollIntoView({ block: 'nearest' }); detail.scrollTop = 0; buttons();
    }
    async function load(reset) {
      if (reset) { controller?.abort(); generation++; query = input.value.trim(); rows = []; selected = -1; cursor = null; list.replaceChildren(); detail.replaceChildren(); }
      if (!query) { busy = false; status.textContent = 'Введите текст для поиска.'; buttons(); return; }
      const version = generation, before = rows.length, after = reset ? -1 : cursor;
      controller = new AbortController(); busy = true; buttons(); status.textContent = 'Поиск…';
      try {
        const response = await fetch('/chat/' + encodeURIComponent(agentId) + '/search?q=' + encodeURIComponent(query) + '&after=' + after, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('Поиск недоступен (' + response.status + ')');
        const data = await response.json();
        if (closed || version !== generation) return;
        cursor = data.next; rows.push(...data.results);
        data.results.forEach((row, i) => { const button = el('button'); button.type = 'button'; highlight(button, speaker(row.role) + ': ' + row.snippet.slice(0, 360), query); button.addEventListener('click', () => select(before + i)); list.append(button); });
        busy = false;
        if (rows.length) select(Math.min(before, rows.length - 1)); else status.textContent = 'В сохранённой истории совпадений нет.';
      } catch (error) {
        if (!closed && version === generation && error.name !== 'AbortError') { busy = false; status.textContent = error.message || 'Поиск недоступен'; }
      } finally { if (!closed && version === generation) { busy = false; buttons(); } }
    }
    function cleanup() {
      if (closed) return; closed = true; generation++; controller?.abort();
      dialog.remove(); if (active === cleanup) active = null;
      const safeFocus = returnFocus?.isConnected ? returnFocus : focusBefore;
      if (safeFocus?.isConnected && !safeFocus.matches('input,textarea,[contenteditable]')) safeFocus.focus({ preventScroll: true });
      if (messages?.isConnected && messageScroll !== undefined) messages.scrollTop = messageScroll;
      window.scrollTo(scrollX, scrollY);
      document.removeEventListener('htmx:before:swap', navigationCleanup);
      window.removeEventListener('popstate', cleanup);
    }
    function navigationCleanup(event) { const target = event.detail?.ctx?.target; if (target && (target === document.body || target.id === 'chat-panel' || target.contains?.(opener))) cleanup(); }
    active = cleanup;
    form.addEventListener('submit', event => { event.preventDefault(); load(true); });
    prev.addEventListener('click', () => select(selected - 1));
    next.addEventListener('click', () => { if (selected + 1 < rows.length) select(selected + 1); else if (!busy && cursor !== null) load(false); });
    close.addEventListener('click', cleanup); dialog.addEventListener('cancel', event => { event.preventDefault(); cleanup(); }); dialog.addEventListener('close', cleanup);
    document.addEventListener('htmx:before:swap', navigationCleanup); window.addEventListener('popstate', cleanup);
    buttons(); dialog.showModal(); input.focus({ preventScroll: true });
  }
  document.addEventListener('click', event => { const trigger = event.target.closest?.('[data-chat-search]'); if (trigger) { event.preventDefault(); open(trigger.dataset.chatSearch, trigger); } });
})();
