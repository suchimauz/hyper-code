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
  var place = function (tip, ring) {
    var rect = ring.getBoundingClientRect();
    tip.style.left = Math.round(rect.left - 4) + 'px';
    tip.style.bottom = Math.round(window.innerHeight - rect.top + 8) + 'px';
  };
  var show = function (ring) {
    var tip = ring.querySelector('.quota-tip');
    if (!tip || !tip.showPopover) return;
    // Belt and braces beside popover=auto: never two cards at once.
    document.querySelectorAll('.quota-tip:popover-open').forEach(function (open) {
      if (open !== tip) { try { open.hidePopover(); } catch (e) { /* already closed */ } }
    });
    place(tip, ring);
    try { tip.showPopover(); } catch (e) { /* already open */ }
  };
  var hide = function (ring) {
    var tip = ring.querySelector('.quota-tip');
    if (tip && tip.hidePopover) { try { tip.hidePopover(); } catch (e) { /* already closed */ } }
  };
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
  document.addEventListener('htmx:afterSwap', function (event) {
    if (!event.target || !event.target.querySelectorAll) return;
    if (!event.target.querySelector('.quota-ring')) return;
    document.querySelectorAll('.quota-tip').forEach(function (tip) {
      if (tip.hidePopover) { try { tip.hidePopover(); } catch (e) { /* already closed */ } }
    });
  });
})();
