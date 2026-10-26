(() => {
  if (window.__projectPagesInstalled) return;
  window.__projectPagesInstalled = true;
  const update = page => {
    const query = page.querySelector('[data-page-search]').value.trim().toLocaleLowerCase();
    const filter = page.querySelector('[data-page-filter][aria-pressed="true"]')?.dataset.pageFilter || 'all';
    const rows = [...page.querySelectorAll('[data-page-row]')];
    let count = 0;
    for (const row of rows) {
      row.hidden = !(row.dataset.search.toLocaleLowerCase().includes(query) && (filter === 'all' || row.dataset[filter] === 'true'));
      if (!row.hidden) count++;
    }
    page.querySelector('[data-page-count]').textContent = String(count);
    page.querySelector('[data-page-empty]').hidden = rows.length > 0 || !!query || filter !== 'all';
    page.querySelector('[data-page-no-results]').hidden = count > 0 || (!query && filter === 'all');
  };
  document.addEventListener('input', event => {
    if (event.target.matches('[data-page-search]')) update(event.target.closest('[data-project-page]'));
  });
  document.addEventListener('click', event => {
    for (const menu of document.querySelectorAll('.pp-menu[open]')) if (!menu.contains(event.target) || event.target.closest('[data-project-action]:not(:disabled)')) menu.open = false;
    const page = event.target.closest('[data-project-page]');
    if (!page) return;
    const filter = event.target.closest('[data-page-filter]');
    const reset = event.target.closest('[data-page-reset]');
    if (filter || reset) {
      if (reset) page.querySelector('[data-page-search]').value = '';
      for (const button of page.querySelectorAll('[data-page-filter]')) button.setAttribute('aria-pressed', String(button.dataset.pageFilter === (filter?.dataset.pageFilter || 'all')));
      update(page);
    }

  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') for (const menu of document.querySelectorAll('.pp-menu[open]')) { menu.open = false; menu.querySelector('summary').focus(); }
  });
})();
