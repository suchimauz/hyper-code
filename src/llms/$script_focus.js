// Focused provider navigation. UI state stays in this page, never in credentials or model policy.
(() => {
  if (window.__hyperLlmFocus) { window.__hyperLlmFocus(); return; }
  const pages = new WeakMap();
  const attr = (node, name, value) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
  const hide = (node, value) => { if (node.hidden !== value) node.hidden = value; };
  const stateFor = page => {
    if (!pages.has(page)) pages.set(page, { section: 'subscriptions', provider: null, query: '', connected: false, scroll: 0, nav: null });
    return pages.get(page);
  };
  const render = () => {
    document.querySelectorAll('.llm-focus-page').forEach(page => {
      const state = stateFor(page);
      page.querySelectorAll('[data-llm-section]').forEach(node => hide(node, node.dataset.llmSection !== state.section));
      page.querySelectorAll('[data-llm-tab]').forEach(node => {
        const selected = node.dataset.llmTab === state.section;
        attr(node, 'aria-selected', String(selected)); attr(node, 'tabindex', selected ? '0' : '-1');
      });
      const content = page.querySelector('#llm-section-content');
      if (content) attr(content, 'aria-labelledby', `llm-section-${state.section}`);
      const search = page.querySelector('#llm-provider-search');
      if (search && search.value !== state.query) search.value = state.query;
      const filter = page.querySelector('.llm-connected-filter');
      if (filter) attr(filter, 'aria-pressed', String(state.connected));
      const buttons = [...page.querySelectorAll('[data-llm-provider]')];
      const visible = buttons.filter(button => {
        const match = button.textContent.toLocaleLowerCase().includes(state.query.toLocaleLowerCase().trim()) && (!state.connected || button.dataset.connected === 'true');
        hide(button, !match); return match;
      });
      if (!visible.some(button => button.dataset.llmProvider === state.provider)) {
        state.provider = visible.find(button => button.dataset.connected === 'true')?.dataset.llmProvider ?? visible[0]?.dataset.llmProvider ?? null;
      }
      buttons.forEach(button => {
        const selected = button.dataset.llmProvider === state.provider;
        attr(button, 'aria-selected', String(selected)); attr(button, 'tabindex', selected ? '0' : '-1');
      });
      page.querySelectorAll('.llm-provider-panel').forEach(panel => hide(panel, panel.dataset.provider !== state.provider));
      const empty = page.querySelector('.llm-provider-empty');
      if (empty) hide(empty, visible.length !== 0);
      const nav = page.querySelector('.llm-provider-nav');
      if (nav) {
        attr(nav, 'aria-orientation', getComputedStyle(nav).flexDirection === 'row' ? 'horizontal' : 'vertical');
        // Restore only a replaced live region, not every render: a mutation microtask
        // can run before the browser's scroll event and otherwise undo selection.
        if (state.nav !== nav) { nav.scrollLeft = state.scroll; state.nav = nav; }
      }
    });
  };
  const select = (page, button) => {
    const state = stateFor(page);
    if (button.dataset.llmTab) state.section = button.dataset.llmTab;
    if (button.dataset.llmProvider) state.provider = button.dataset.llmProvider;
    render();
    if (button.dataset.llmProvider) {
      const nav = button.closest('.llm-provider-nav');
      if (nav && getComputedStyle(nav).flexDirection === 'row') {
        const item = button.getBoundingClientRect();
        const bounds = nav.getBoundingClientRect();
        // Scroll only the provider rail. scrollIntoView also moves outer page/chat panes.
        if (item.left < bounds.left) nav.scrollLeft -= bounds.left - item.left;
        else if (item.right > bounds.right) nav.scrollLeft += item.right - bounds.right;
        state.scroll = nav.scrollLeft;
      }
    }
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-llm-tab], [data-llm-provider], .llm-connected-filter');
    const page = button?.closest('.llm-focus-page');
    if (!page) return;
    if (button.matches('.llm-connected-filter')) { stateFor(page).connected = !stateFor(page).connected; render(); }
    else select(page, button);
  });
  document.addEventListener('input', event => {
    if (event.target.id !== 'llm-provider-search') return;
    const page = event.target.closest('.llm-focus-page');
    if (page) { stateFor(page).query = event.target.value; render(); }
  });
  document.addEventListener('keydown', event => {
    const button = event.target.closest('[data-llm-tab], [data-llm-provider]');
    const page = button?.closest('.llm-focus-page');
    if (!page || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const list = [...button.closest('[role="tablist"]').querySelectorAll('[role="tab"]')].filter(node => !node.hidden);
    const index = list.indexOf(button);
    const next = event.key === 'Home' ? list[0] : event.key === 'End' ? list.at(-1) : list[(index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + list.length) % list.length];
    if (!next) return;
    event.preventDefault(); select(page, next); next.focus({ preventScroll: true });
  });
  document.addEventListener('scroll', event => {
    if (!event.target.matches?.('.llm-provider-nav')) return;
    const page = event.target.closest('.llm-focus-page');
    if (page) stateFor(page).scroll = event.target.scrollLeft;
  }, true);
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; render(); });
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-selected', 'data-connected'] });
  window.addEventListener('resize', schedule);
  window.__hyperLlmFocus = render;
  render();
})();
