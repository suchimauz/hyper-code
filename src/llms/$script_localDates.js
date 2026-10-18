// Localize node quota timestamps in the viewer's timezone, including live morphs.
(() => {
  if (window.__hyperLlmLocalDates) {
    window.__hyperLlmLocalDates();
    return;
  }
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const render = () => {
    document.querySelectorAll('time[data-llm-local-time]').forEach(node => {
      const date = new Date(node.getAttribute('datetime'));
      if (!Number.isFinite(date.getTime())) return;
      const text = formatter.format(date);
      if (node.textContent !== text) node.textContent = text;
    });
  };
  window.__hyperLlmLocalDates = render;
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; render(); });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['datetime'] });
  render();
})();
