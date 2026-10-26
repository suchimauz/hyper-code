// Hover cards for the dock quota rings.
//
// The dock column carries a backdrop-filter, which creates a stacking
// context: nothing inside it, at any z-index, can paint above the chat
// column next door. So the card rides in the browser top layer through
// the Popover API, and its position is pinned to the ring from
// getBoundingClientRect on every show — fixed coordinates survive the
// top layer and need no CSS anchor support.
(function () {
  var current = null;
  // Server timestamps explicitly say UTC until the viewer's timezone is known.
  var localizeResets = function () {
    var full = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
    document.querySelectorAll('time[data-quota-reset-detail]').forEach(function (time) {
      var value = new Date(time.dateTime);
      if (!Number.isFinite(value.getTime())) return;
      var previous = time.textContent, local = full.format(value);
      time.textContent = local;
      // The ring has its own label because the visual popover is aria-hidden.
      // Keep that label in the same client timezone, including after reformatting.
      var ring = time.closest('.quota-ring'), label = ring && ring.getAttribute('aria-label');
      if (label && previous) ring.setAttribute('aria-label', label.split('resets ' + previous).join('resets ' + local));
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', localizeResets, { once: true });
  else localizeResets();
  var place = function (tip, ring) {
    var rect = ring.getBoundingClientRect(), gap = 8;
    var width = tip.offsetWidth, height = tip.offsetHeight;
    var left = Math.max(gap, Math.min(rect.left - 4, window.innerWidth - width - gap));
    var above = rect.top - height - gap;
    var below = above < gap;
    var top = Math.max(gap, Math.min(below ? rect.bottom + gap : above, window.innerHeight - height - gap));
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    tip.style.bottom = 'auto';
    tip.dataset.side = below ? 'below' : 'above';
    tip.style.setProperty('--quota-tip-arrow', Math.max(12, Math.min(rect.left + rect.width / 2 - left - 4, width - 21)) + 'px');
    tip.toggleAttribute('data-clipped', tip.scrollHeight > tip.clientHeight);
  };
  var show = function (ring) {
    localizeResets();
    var tip = ring.querySelector('.quota-tip');
    if (!tip || !tip.showPopover) return;
    // Belt and braces beside popover=auto: never two cards at once.
    document.querySelectorAll('.quota-tip:popover-open').forEach(function (open) {
      if (open !== tip) { try { open.hidePopover(); } catch (e) { /* already closed */ } }
    });
    try { tip.showPopover(); } catch (e) { /* already open */ }
    // Measure the localized, visible card before clamping it to the viewport.
    place(tip, ring);
  };
  var hide = function (ring) {
    var tip = ring.querySelector('.quota-tip');
    if (tip && tip.hidePopover) { try { tip.hidePopover(); } catch (e) { /* already closed */ } }
  };
  var reposition = function () {
    if (!current || !current.isConnected) return;
    var tip = current.querySelector('.quota-tip');
    if (tip && tip.matches(':popover-open')) place(tip, current);
  };
  window.addEventListener('resize', reposition);
  document.addEventListener('scroll', reposition, true);
  document.addEventListener('pointerover', function (event) {
    var ring = event.target.closest && event.target.closest('.quota-ring');
    if (ring && !ring.contains(current)) { current = ring; show(ring); }
  });
  document.addEventListener('pointerout', function (event) {
    var ring = event.target.closest && event.target.closest('.quota-ring');
    if (ring && !ring.contains(event.relatedTarget)) {
      if (current === ring) current = null;
      // Give the pointer a moment to come back through the gap.
      setTimeout(function () { if (!ring.matches(':hover')) hide(ring); }, 120);
    }
  });
  document.addEventListener('focusin', function (event) {
    var ring = event.target.closest && event.target.closest('.quota-ring');
    if (ring) { current = ring; show(ring); }
  });
  document.addEventListener('focusout', function (event) {
    var ring = event.target.closest && event.target.closest('.quota-ring');
    if (ring && !ring.contains(event.relatedTarget)) hide(ring);
  });
  // A re-swapped strip leaves a dangling top-layer card; close what is gone.
  document.addEventListener('htmx:after:swap', function (event) {
    localizeResets();
    if (!event.target || !event.target.querySelectorAll) return;
    if (!event.target.querySelector('.quota-ring')) return;
    document.querySelectorAll('.quota-tip').forEach(function (tip) {
      if (tip.hidePopover) { try { tip.hidePopover(); } catch (e) { /* already closed */ } }
    });
  });
})();
