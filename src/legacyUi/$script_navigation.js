// Keep shared canonical fragments and event-driven links inside the legacy shell.
(() => {
  if (!window.hyperLegacyUi) return;
  const rewrite = root => {
    for (const el of root.querySelectorAll('a[href],area[href],form[action],[hx-push-url],[hx-replace-url]')) {
      for (const attr of ['href','action','hx-push-url','hx-replace-url']) {
        const value = el.getAttribute(attr);
        if (value && !/^\/(?:api|auth|procs|external|node)(?:\/|$)/.test(value)) el.setAttribute(attr,window.hyperLegacyUrl(value));
      }
    }
  };
  document.addEventListener('click', event => {
    const a = event.target.closest?.('a[href]');
    if(a) a.setAttribute('href',window.hyperLegacyUrl(a.getAttribute('href')));
  },true);
  document.addEventListener('htmx:configRequest',event => {
    const target = event.detail.target;
    if(target?.id === 'main') event.detail.path = window.hyperLegacyUrl(event.detail.path);
  });
  document.addEventListener('htmx:beforeOnLoad',event => {
    for(const header of ['HX-Redirect','HX-Push-Url','HX-Replace-Url']) {
      const value = event.detail.xhr.getResponseHeader(header);
      if(header === 'HX-Redirect' && value && value.startsWith('/')) {
        event.preventDefault(); location.assign(window.hyperLegacyUrl(value)); return;
      }
    }
  });
  document.addEventListener('htmx:afterSwap',() => rewrite(document));
  rewrite(document);
})();
