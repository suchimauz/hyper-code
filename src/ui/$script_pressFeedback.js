// Immediate, presentation-only feedback. Never synthesize clicks, capture pointers,
// prevent scrolling, focus the composer, or change an action's timing.
(() => {
  if (window.__hyperPressFeedbackInstalled) return;
  window.__hyperPressFeedbackInstalled = true;
  const scopes = '#chat-panel, #project-tabs-host, #nav-overlay, #mobile-nav-button, #app-popup, [data-mobile-inspector-dialog], .mobile-usage-dialog, .home-dashboard';
  const controls = 'button, a[href], summary, [role="button"], .tool';
  let press = null, releaseTimer = 0;
  const target = node => {
    const editor = node?.closest?.('.chat-composer textarea, .chat-composer [contenteditable]:not([contenteditable="false"])');
    if (editor && !editor.matches(':disabled, [readonly]')) return editor.closest('.chat-box');
    const control = node?.closest?.(controls);
    if (!control || !control.closest(scopes) || control.matches(':disabled, [aria-disabled="true"], [inert]') || control.closest('[inert]')) return null;
    if (node.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return null;
    return control;
  };
  const clear = () => {
    clearTimeout(releaseTimer);
    press?.node.removeAttribute('data-ui-pressed');
    press = null;
  };
  const start = (node, pointerId, x = 0, y = 0, key = '') => {
    clear();
    press = { node, pointerId, x, y, key, at: performance.now() };
    node.setAttribute('data-ui-pressed', '');
  };
  const release = () => {
    if (!press) return;
    // A quick tap still gets one short, visible acknowledgement.
    releaseTimer = setTimeout(clear, Math.max(0, 90 - (performance.now() - press.at)));
  };
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const node = target(event.target);
    if (node) start(node, event.pointerId, event.clientX, event.clientY);
  }, { capture: true, passive: true });
  document.addEventListener('pointermove', event => {
    if (!press || press.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) clear();
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', event => { if (press?.pointerId === event.pointerId) release(); }, { capture: true, passive: true });
  document.addEventListener('pointercancel', clear, { capture: true, passive: true });
  document.addEventListener('scroll', clear, { capture: true, passive: true });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.key === 'Tab') { clear(); return; }
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || !['Enter', ' '].includes(event.key)) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const node = target(event.target);
    if (!node || (event.key === ' ' && node.matches('a[href]'))) return;
    start(node, null, 0, 0, event.key);
  }, true);
  document.addEventListener('keyup', event => { if (press?.key === event.key) release(); }, true);
  document.addEventListener('visibilitychange', clear);
  document.addEventListener('htmx:beforeSwap', clear);
  document.addEventListener('htmx:before:swap', clear);
  window.addEventListener('blur', clear);
  window.addEventListener('pagehide', clear);
})();
