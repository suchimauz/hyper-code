// One visible monitor, one in-flight request, shared server-side sampling cache.
// Move the same panel between the inspector and chat footer; never duplicate IDs.
(() => {
    if (window.__hyperResourcesInstalled) return;
    window.__hyperResourcesInstalled = true;
    let active = null, timer = null, request = null, scheduled = false;
    const interval = 2000;
    const text = (root, key, value) => { const el = root.querySelector(`[data-resource-${key}]`); if (el && el.textContent !== value) el.textContent = value; };
    const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const percent = value => number(value) ? `${Math.round(value)}%` : 'н/д';
    const bytes = value => {
        if (!number(value)) return 'н/д';
        if (value === 0) return '0';
        const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
        const n = Math.max(0, Math.min(4, Math.floor(Math.log(value) / Math.log(1024))));
        return `${(value / 1024 ** n).toFixed(n >= 3 ? 1 : 0)} ${units[n]}`;
    };
    const ratio = (used, total) => number(used) && number(total) && total > 0 ? Math.min(100, used / total * 100) : 0;
    const age = state => state.snapshot ? Math.max(0, Date.now() - state.receivedAt + state.initialAge) : Infinity;
    function freshness(state) {
        const ms = age(state), stale = state.failed || (!!state.snapshot && ms > 7000);
        state.panel.toggleAttribute('data-resource-stale', stale);
        const label = !state.snapshot ? (state.failed ? 'нет данных' : 'загрузка…') : stale ? `нет обновлений · ${Math.floor(ms / 1000)} с` : `обновлено ${Math.floor(ms / 1000)} с назад`;
        text(state.panel, 'fresh', label);
        text(state.dock, 'mini-state', stale ? 'нет данных' : state.snapshot ? '' : 'загрузка…');
        const message = stale ? (state.snapshot ? 'Показан последний замер. Обновление недоступно.' : 'Не удалось получить метрики сервера.') : state.snapshot?.cpu.machine >= 90 ? `Высокая загрузка CPU · ${percent(state.snapshot.cpu.machine)}` : '';
        const status = state.panel.querySelector('[data-resource-status]');
        status.hidden = !message;
        if (status.textContent !== message) status.textContent = message;
    }
    function render(state, snapshot) {
        state.snapshot = snapshot;
        state.receivedAt = Date.now();
        state.initialAge = Math.max(0, state.receivedAt - snapshot.sampledAt);
        state.failed = false;
        const root = state.panel;
        text(root, 'host', `${snapshot.host} · ${snapshot.cpuCount} CPU`);
        const metrics = {
            cpu: { machine: percent(snapshot.cpu.machine), hyper: percent(snapshot.cpu.hyper), used: snapshot.cpu.machine, own: snapshot.cpu.hyper },
            memory: { machine: `${bytes(snapshot.memory.used)} / ${bytes(snapshot.memory.total)}`, hyper: bytes(snapshot.memory.hyper), used: ratio(snapshot.memory.used, snapshot.memory.total), own: ratio(snapshot.memory.hyper, snapshot.memory.total) },
            swap: { machine: snapshot.swap.total === 0 ? 'не настроен' : `${bytes(snapshot.swap.used)} / ${bytes(snapshot.swap.total)}`, hyper: bytes(snapshot.swap.hyper), used: ratio(snapshot.swap.used, snapshot.swap.total), own: ratio(snapshot.swap.hyper, snapshot.swap.total) },
        };
        for (const [name, metric] of Object.entries(metrics)) {
            const row = root.querySelector(`[data-resource-metric="${name}"]`);
            text(row, 'machine', metric.machine); text(row, 'hyper', metric.hyper);
            const used = number(metric.used) ? Math.min(100, metric.used) : 0;
            const own = number(metric.own) ? Math.min(used, metric.own) : 0;
            row.querySelector('[data-resource-own-bar]').style.width = `${own}%`;
            row.querySelector('[data-resource-other-bar]').style.width = `${Math.max(0, used - own)}%`;
        }
        text(state.dock, 'mini', `CPU ${percent(snapshot.cpu.machine)} · RAM ${bytes(snapshot.memory.used)}/${bytes(snapshot.memory.total)} · Swap ${bytes(snapshot.swap.used)}`);
        text(root, 'count', `Процессы Hyper · ${snapshot.supported ? snapshot.processCount : 'н/д'}`);
        text(root, 'basis', `CPU: 100% = ${snapshot.cpuCount} CPU`);
        text(root, 'memory-basis', snapshot.memoryBasis === 'PSS' ? 'Память Hyper — PSS: общие страницы учитываются пропорционально. Единицы — GiB / MiB.' : snapshot.memoryBasis === 'RSS' ? 'Память Hyper — RSS: общие страницы могут учитываться повторно. Единицы — GiB / MiB.' : 'Память процессов недоступна. «н/д» означает отсутствие замера, а не нулевую нагрузку.');
        text(root, 'note', snapshot.note || 'Обновление раз в 2 секунды, пока вкладка видна.');
        const rows = root.querySelector('[data-resource-groups]');
        rows.replaceChildren(...snapshot.groups.map(group => {
            const tr = document.createElement('tr');
            for (const value of [`${group.name} · ${group.count}`, percent(group.cpu), bytes(group.memory), bytes(group.swap)]) {
                const td = document.createElement('td'); td.textContent = value; tr.append(td);
            }
            return tr;
        }));
        freshness(state);
    }
    function place(state) {
        const inspector = document.getElementById(`agent-meta-${state.chat.dataset.agentId}`);
        const content = inspector?.querySelector('[data-agent-meta-content]');
        const expanded = inspector && content && getComputedStyle(inspector).display !== 'none' && getComputedStyle(content).display !== 'none';
        const destination = expanded ? inspector : state.dock;
        if (state.panel.parentElement !== destination) destination.append(state.panel);
        state.panel.toggleAttribute('data-resource-inline', !!expanded);
        state.dock.hidden = !!expanded;
        state.panel.hidden = !expanded && !state.open;
        state.panel.querySelector('[data-resource-close]').hidden = !!expanded;
        state.trigger.setAttribute('aria-expanded', String(!expanded && state.open));
        // If a focused popup is docked after inspector expansion, do not lose focus.
        if (state.wasInline !== !!expanded) { state.open = false; state.panel.hidden = !expanded; state.trigger.setAttribute('aria-expanded', 'false'); }
        state.wasInline = !!expanded;
    }
    function close(state, focus = false) {
        state.open = false; place(state);
        if (focus && !state.dock.hidden) state.trigger.focus({ preventScroll: true });
    }
    function sync() {
        scheduled = false;
        const chat = document.querySelector('[data-page="agent"] #chat-panel');
        const dock = chat?.querySelector('[data-resource-dock]');
        if (active && active.dock !== dock) {
            if (request) request.abort();
            active.panel.remove(); active = null;
        }
        if (!active && dock) {
            const panel = dock.querySelector('[data-resource-panel]');
            if (panel) active = {chat,dock,panel,trigger:dock.querySelector('[data-resource-open]'),open:false,wasInline:null,snapshot:null,failed:false,receivedAt:0,initialAge:0,lastAttempt:0};
        }
        if (active) place(active);
        if (!active || document.hidden) {
            clearTimeout(timer); timer = null;
            if (request) request.abort();
        } else if (!timer && !request) void tick();
    }
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(sync);
    }
    async function tick() {
        timer = null;
        const state = active;
        if (!state || document.hidden) return;
        freshness(state);
        if (Date.now() - state.lastAttempt >= interval && !request) {
            const controller = new AbortController(); request = controller;
            state.lastAttempt = Date.now();
            const deadline = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await fetch('/ui/server-resources', {credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'},signal:controller.signal});
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const snapshot = await response.json();
                if (!number(snapshot.sampledAt) || !snapshot.cpu || !snapshot.memory || !snapshot.swap || !Array.isArray(snapshot.groups)) throw new Error('Invalid resource snapshot');
                if (active === state && !document.hidden) render(state, snapshot);
            } catch (error) {
                if (active === state && !document.hidden) { state.failed = true; freshness(state); }
            } finally {
                clearTimeout(deadline);
                if (request === controller) request = null;
            }
        }
        if (active && !document.hidden && !timer) timer = setTimeout(tick, Math.max(250, interval - (Date.now() - active.lastAttempt)));
    }
    document.addEventListener('click', event => {
        if (!active) return;
        if (event.target.closest?.('[data-resource-open]') === active.trigger) {
            active.open = !active.open; place(active);
            if (active.open) active.panel.querySelector('[data-resource-close]').focus({ preventScroll:true });
        } else if (event.target.closest?.('[data-resource-close]') && active.panel.contains(event.target)) close(active, true);
        else if (active.open && !active.panel.contains(event.target)) close(active);
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && active?.open) { event.preventDefault(); close(active, true); } });
    document.addEventListener('focusin', event => { if (active?.open && !active.panel.contains(event.target) && event.target !== active.trigger) close(active); });
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('htmx:after:swap', schedule);
    document.addEventListener('htmx:after:process', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('online', () => { if (active) active.lastAttempt = 0; sync(); });
    // Watch only shell visibility/navigation changes, not our live text or bars.
    new MutationObserver(records => {
        if (records.some(record => !record.target.closest?.('[data-resource-panel], [data-resource-dock]'))) schedule();
    }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-canvas-open','data-canvas-meta-open','data-presentation','open']});
    sync();
})();
