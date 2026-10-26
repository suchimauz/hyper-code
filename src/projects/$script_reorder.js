(() => {
  if (window.__projectReorderInstalled) return;
  window.__projectReorderInstalled = true;
  const containerSelector = '#project-sidebar [data-project-order], #project-tabs-host [data-project-order]';
  const items = list => [...list.children].filter(el => el.hasAttribute('data-reorder-id'));
  const ids = list => items(list).map(el => el.dataset.reorderId);
  let drag = null, saving = false, marker = null, frame = 0, point = null, suppressClick = false;
  // Set native drag attributes on the DOM, not through the shared button renderer's allowlist.
  const prepare = () => {
    document.querySelectorAll(containerSelector).forEach(list => items(list).forEach(item => {
      item.setAttribute('draggable', 'true');
      item.querySelectorAll('a,img').forEach(el => { el.setAttribute('draggable', 'false'); });
    }));
    if (drag && !saving && !drag.list.isConnected) finish(drag);
  };
  new MutationObserver(records => {
    if (records.some(record => record.target.closest?.('#project-sidebar, #project-tabs-host') || [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches('#project-sidebar, #project-tabs-host') || node.querySelector('#project-sidebar, #project-tabs-host'))))) prepare();
    else if (drag && !saving && !drag.list.isConnected) finish(drag);
  }).observe(document.body, {childList:true, subtree:true});
  prepare();
  const announce = text => {
    let status = document.getElementById('project-order-status');
    if (!status) {
      status = document.createElement('div'); status.id = 'project-order-status';
      status.className = 'sr-only'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      document.body.append(status);
    }
    status.textContent = text;
  };
  const begin = (list, item) => {
    let resolve;
    const done = new Promise(r => { resolve = r; });
    const state = {list, item, original:ids(list), projectId:list.closest('[data-project-id]')?.dataset.projectId, target:null, after:false, resolve};
    list.setAttribute('aria-busy', 'true');
    const detail = {done, ready:Promise.resolve()};
    document.dispatchEvent(new CustomEvent('projects:reorder-start', {detail}));
    state.ready = detail.ready;
    return state;
  };
  const clearMarker = () => { marker?.remove(); marker = null; cancelAnimationFrame(frame); frame = 0; point = null; };
  const finish = state => {
    clearMarker(); state.item.classList.remove('project-dragging'); state.list.removeAttribute('aria-busy');
    if (drag === state) drag = null;
    saving = false; state.resolve();
    document.dispatchEvent(new CustomEvent('projects:reorder-end'));
  };
  const restore = state => {
    const byId = new Map(items(state.list).map(el => [el.dataset.reorderId, el]));
    state.original.forEach(id => { const el = byId.get(id); if (el) state.list.append(el); });
  };
  const save = async state => {
    const next = ids(state.list);
    if (next.every((id, i) => id === state.original[i])) { finish(state); return; }
    saving = true;
    clearMarker(); state.item.classList.remove('project-dragging');
    announce('Сохраняем порядок…');
    try {
      await state.ready;
      const body = state.list.dataset.projectOrder === 'projects'
        ? {action:'reorder-projects', projectIds:next}
        : {action:'reorder-tabs', projectId:state.projectId, tabIds:next};
      const r = await fetch('/projects/action', {method:'POST', headers:{'Content-Type':'application/json', Accept:'application/json', 'X-CSRF-Token':document.querySelector('meta[name="csrf-token"]')?.content || ''}, body:JSON.stringify(body), signal:AbortSignal.timeout(15000)});
      const data = await r.json();
      if (!r.ok || data.ok === false) throw new Error(data.error || 'Не удалось сохранить порядок');
      announce('Порядок сохранён');
    } catch (error) {
      restore(state);
      announce('Не удалось сохранить порядок');
      document.dispatchEvent(new CustomEvent('projects:reorder-error', {detail:{message:error.message || 'Не удалось сохранить порядок'}}));
    } finally { finish(state); }
  };
  const source = event => {
    const item = event.target.closest?.('[data-reorder-id]'), list = item?.parentElement;
    if (!list?.matches(containerSelector) || event.target.closest('button,summary,details,input,textarea,select')) return null;
    return {item, list};
  };
  const placeMarker = (state, target, after) => {
    state.target = target; state.after = after;
    if (!marker) {
      marker = document.createElement('div'); marker.className = 'project-drop-marker'; marker.setAttribute('aria-hidden', 'true'); document.body.append(marker);
    }
    const r = target.getBoundingClientRect(), vertical = state.list.dataset.projectOrder === 'projects';
    Object.assign(marker.style, vertical
      ? {left:r.left+'px', top:(after?r.bottom:r.top)-1+'px', width:r.width+'px', height:'2px'}
      : {left:(after?r.right:r.left)-1+'px', top:r.top+'px', width:'2px', height:r.height+'px'});
  };
  const locate = (state, x, y) => {
    let best = null, distance = Infinity;
    for (const item of items(state.list)) {
      const r = item.getBoundingClientRect();
      const dx = Math.max(r.left-x, 0, x-r.right), dy = Math.max(r.top-y, 0, y-r.bottom);
      const d = dx*dx + dy*dy;
      if (d < distance) { distance = d; best = item; }
    }
    if (!best) return;
    const r = best.getBoundingClientRect();
    placeMarker(state, best, state.list.dataset.projectOrder === 'projects' ? y > (r.top+r.bottom)/2 : x > (r.left+r.right)/2);
  };
  const scroll = () => {
    frame = 0;
    if (!drag || !point || saving) return;
    let el = drag.list;
    while (el && !(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    el ||= document.scrollingElement;
    if (el) {
      const r = el === document.scrollingElement ? {top:0, bottom:innerHeight} : el.getBoundingClientRect();
      const delta = point.y < r.top+28 ? -12 : point.y > r.bottom-28 ? 12 : 0;
      if (delta) { el.scrollTop += delta; locate(drag, point.x, point.y); }
    }
    frame = requestAnimationFrame(scroll);
  };
  // Native desktop dragging leaves touch scrolling and modified link clicks alone.
  document.addEventListener('dragstart', event => {
    const found = source(event);
    if (!found) {
      if (event.target.closest?.(containerSelector)) event.preventDefault();
      return;
    }
    if (saving || drag || items(found.list).length < 2) { event.preventDefault(); return; }
    drag = begin(found.list, found.item);
    event.dataTransfer.clearData();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-hyper-order', found.item.dataset.reorderId);
    drag.item.classList.add('project-dragging');
    announce('Переместите элемент на новое место. Escape — отмена.');
  });
  document.addEventListener('dragover', event => {
    if (!drag || saving) return;
    const list = event.target.closest?.(containerSelector);
    if (list !== drag.list) { drag.target = null; clearMarker(); return; }
    event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    point = {x:event.clientX, y:event.clientY}; locate(drag, point.x, point.y);
    if (!frame) frame = requestAnimationFrame(scroll);
  });
  document.addEventListener('dragleave', event => {
    if (drag && event.target === drag.list && !drag.list.contains(event.relatedTarget)) { drag.target = null; clearMarker(); }
  });
  document.addEventListener('drop', event => {
    if (!drag || saving || event.target.closest?.(containerSelector) !== drag.list) return;
    event.preventDefault(); event.stopPropagation();
    const state = drag;
    locate(state, event.clientX, event.clientY);
    if (state.target && state.target !== state.item) state.list.insertBefore(state.item, state.after ? state.target.nextSibling : state.target);
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    void save(state);
  });
  document.addEventListener('dragend', () => { if (drag && !saving) { announce('Перемещение отменено'); finish(drag); } });
  document.addEventListener('click', event => {
    if (suppressClick && event.target.closest?.(containerSelector)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag && !saving) { event.preventDefault(); finish(drag); return; }
    if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
    const found = source(event);
    if (!found) return;
    const keys = found.list.dataset.projectOrder === 'projects' ? ['ArrowUp','ArrowDown'] : ['ArrowLeft','ArrowRight'];
    const direction = keys.indexOf(event.key);
    if (direction < 0) return;
    event.preventDefault(); event.stopPropagation();
    if (saving || drag) return;
    const all = items(found.list), index = all.indexOf(found.item), next = all[index+(direction?1:-1)];
    if (!next) return;
    const focused = document.activeElement, state = begin(found.list, found.item);
    found.list.insertBefore(found.item, direction ? next.nextSibling : next);
    focused?.focus({preventScroll:true});
    void save(state);
  });
})();
