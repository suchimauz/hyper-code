// The agent inspector panel, client side.
//
// 1) Plan editor rows: adding and saving are ordinary HTMX + form operations;
//    only removing and reordering unsaved rows needs JavaScript.
//
// 2) Section redraws: the server pushes ui.metaSection (events.refreshAgentMeta)
//    over the shared event stream, and the section re-fetches itself through
//    the RPC endpoint (ui.agentMetaSectionHtml). The <details> shell comes back
//    with the fragment, so "open" is restored around the swap — a redraw must
//    never fold a section the user has open. Redraws are debounced per slot:
//    an active plan ticks many times a second and must cost one request.
(() => {
    if (window.__hyperMetaInstalled) return;
    window.__hyperMetaInstalled = true;


    const applyPanelState = panel => {
        const collapsed = panel.classList.contains('agent-meta-collapsed');
        const button = panel.querySelector('[data-agent-meta-toggle]');
        button?.setAttribute('aria-expanded', String(!collapsed));
        if (button) {
            button.title = collapsed ? 'Expand agent inspector' : 'Collapse agent inspector';
            button.setAttribute('aria-label', button.title);
        }
    };
    const applyAllPanelStates = root => {
        if (root?.matches?.('[data-agent-meta-panel]')) applyPanelState(root);
        root?.querySelectorAll?.('[data-agent-meta-panel]').forEach(applyPanelState);
    };
    applyAllPanelStates(document);
    document.addEventListener('htmx:after:process', event => applyAllPanelStates(event.target));

    document.addEventListener('click', event => {
        const button = event.target.closest?.('[data-plan-remove], [data-plan-move]');


        const toggle = event.target.closest?.('[data-agent-meta-toggle]');
        if (toggle) {
            const panel = toggle.closest('[data-agent-meta-panel]');
            if (!panel) return;
            event.preventDefault();
            const collapsed = !panel.classList.contains('agent-meta-collapsed');
            panel.classList.toggle('agent-meta-collapsed', collapsed);
            applyPanelState(panel);
            fetch('/ui/right-panel', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ collapsed }),
            }).catch(() => {});
            return;
        }

        if (!button) return;
        const form = button.closest('[data-plan-editor]');
        const tasks = form?.querySelector('[data-plan-tasks]');
        const row = button.closest('[data-plan-task]');
        if (!tasks || !row || row.dataset.taskStatus !== 'pending') return;
        event.preventDefault();
        if (button.matches('[data-plan-remove]')) return row.remove();
        const rows = [...tasks.querySelectorAll('[data-plan-task][data-task-status="pending"]')];
        const index = rows.indexOf(row);
        if (button.matches('[data-plan-move="up"]') && index > 0) tasks.insertBefore(row, rows[index - 1]);
        if (button.matches('[data-plan-move="down"]') && index >= 0 && index < rows.length - 1) tasks.insertBefore(rows[index + 1], row);
    });

    const syncTaskTitles = root => [ ...(root?.matches?.('[data-plan-task]') ? [root] : []), ...(root?.querySelectorAll?.('[data-plan-task]') || []) ].forEach(row => {
        const title = row.querySelector('[name="task_title"]');
        const heading = row.querySelector('[data-plan-task-title]');
        if (title && heading) heading.textContent = title.value || 'Untitled task';
    });
    document.addEventListener('input', event => {
        if (event.target.matches?.('[name="task_title"]')) syncTaskTitles(event.target.closest('[data-plan-tasks]'));
    });
    document.addEventListener('invalid', event => {
        const row = event.target.closest?.('details[data-plan-task]');
        if (row) {
            for (let details = row; details; details = details.parentElement?.closest('details')) details.open = true;
        }
    }, true);
    document.addEventListener('htmx:after:process', event => syncTaskTitles(event.target));

    // Saved values and editable text are distinct; Enter must not pin inheritance.
    const compactionRequests = new WeakMap();
    const compactionVersions = new WeakMap();
    const redrawVersions = new WeakMap();
    const redrawDrafts = new WeakMap();
    const compactionSlot = element => element?.closest?.('[data-meta-section="compaction"]');
    const updateCompaction = slot => {
        const form = slot?.querySelector('[data-compaction-saved]');
        if (!form) return;
        const input = form.elements.percent;
        const changed = input.value.trim() === '' || Number(input.value) !== Number(form.dataset.compactionSaved);
        const valid = input.value.trim() !== '' && Number.isFinite(Number(input.value)) && Number(input.value) >= 30 && Number(input.value) <= 95;
        const busy = compactionRequests.has(slot);
        const apply = form.querySelector('[data-compaction-apply]');
        apply.hidden = !changed;
        const button = apply.querySelector('button');
        button.disabled = !changed || !valid || busy;
        button.setAttribute('aria-disabled', String(button.disabled));
        slot.querySelectorAll('[data-compaction-reset] button').forEach(button => { button.disabled = busy; });
        form.setAttribute('aria-busy', String(busy));
    };
    document.querySelectorAll('[data-meta-section="compaction"]').forEach(updateCompaction);
    document.addEventListener('input', event => updateCompaction(compactionSlot(event.target)));
    document.addEventListener('htmx:after:process', event => {
        updateCompaction(compactionSlot(event.target));
        event.target.querySelectorAll?.('[data-meta-section="compaction"]').forEach(updateCompaction);
    });
    document.addEventListener('htmx:before:request', event => {
        const rpc = event.detail?.ctx;
        if (rpc?.target?.dataset?.metaSection === 'compaction') redrawVersions.set(rpc, compactionVersions.get(rpc.target) || 0);
        const form = event.detail?.ctx?.sourceElement?.closest?.('[data-compaction-form]');
        const slot = compactionSlot(form);
        if (!slot) return;
        updateCompaction(slot);
        if (compactionRequests.has(slot) || (form.hasAttribute('data-compaction-saved') && form.querySelector('button').disabled)) {
            event.preventDefault();
            return;
        }
        compactionVersions.set(slot, (compactionVersions.get(slot) || 0) + 1);
        compactionRequests.set(slot, { value: form.elements.percent?.value, draft: slot.querySelector('[name="percent"]').value, reset: form.hasAttribute('data-compaction-reset') });
        updateCompaction(slot);
    });
    const finishCompaction = event => {
        const form = event.detail?.ctx?.sourceElement?.closest?.('[data-compaction-form]');
        const slot = compactionSlot(form);
        if (!slot) return;
        const request = compactionRequests.get(slot);
        compactionRequests.delete(slot);
        const error = slot.querySelector('[data-compaction-error]');
        if (!request) return;
        const response = event.detail?.ctx;
        const failed = !(response?.response?.status >= 200 && response.response.status < 300);
        if (error) {
            error.textContent = failed ? (response?.text || 'Could not save compaction settings. Please try again.').slice(0, 500) : '';
            error.hidden = !failed;
        }
        if (!failed && request) {
            const editor = slot.querySelector('[data-compaction-saved]');
            const saved = request.reset ? form.dataset.compactionReset : request.value;
            editor.dataset.compactionSaved = saved;
            if (request.reset && editor.elements.percent.value === request.draft) editor.elements.percent.value = saved;
            editor.elements.percent.defaultValue = saved;
            redraw(slot);
        }
        updateCompaction(slot);
    };
    document.addEventListener('htmx:after:request', finishCompaction);
    document.addEventListener('htmx:error', finishCompaction);
    document.addEventListener('htmx:finally:request', finishCompaction);
    document.addEventListener('htmx:before:swap', event => {
        const rpc = event.detail?.ctx;
        const target = rpc?.target;
        if (target?.dataset?.metaSection !== 'compaction') return;
        if (compactionRequests.has(target) || (redrawVersions.has(rpc) && redrawVersions.get(rpc) !== (compactionVersions.get(target) || 0))) {
            event.preventDefault();
            return;
        }
        const form = target.querySelector('[data-compaction-saved]');
        const input = form?.elements.percent;
        if (input && (input.value.trim() === '' || Number(input.value) !== Number(form.dataset.compactionSaved))) redrawDrafts.set(rpc, input.value);
    });
    document.addEventListener('htmx:after:swap', event => {
        const rpc = event.detail?.ctx;
        const slot = rpc?.target;
        if (slot?.dataset?.metaSection !== 'compaction') return;
        if (redrawDrafts.has(rpc)) {
            const input = slot.querySelector('[name="percent"]');
            if (input) input.value = redrawDrafts.get(rpc);
            redrawDrafts.delete(rpc);
        }
        updateCompaction(slot);
    });

    const SECTIONS = ['compaction', 'goal', 'knowledge', 'automation', 'settings', 'team', 'plan'];
    const pending = new Map(); // element -> timer

    // innerMorph keeps what the reader has in hand: open/closed sections
    // (morphIgnore "open"), focus, caret and typed text in inputs.
    function redraw(slot) {
        // Do not detach the requesting form while its write is pending.
        if (compactionRequests.has(slot)) return;
        const agentId = slot.id.slice(slot.id.lastIndexOf('-') + 1);
        htmx.ajax('POST', '/rpc', {
            target: slot,
            swap: 'innerMorph',
            values: { method: 'ui.agentMetaSectionHtml', params: JSON.stringify({ agentId, section: slot.dataset.metaSection }) },
            headers: window.hyperRpcCsrfHeaders?.() || {},
        }).then(() => { updateCompaction(slot); syncTaskTitles(slot); }).catch(() => {});
    }

    const onEvent = data => {
        if (!data.agentId) return;
        const sections = data.section && data.section !== 'all' ? [data.section] : SECTIONS;
        for (const section of sections) {
            const slot = document.getElementById(`agent-meta-${section}-${data.agentId}`);
            if (!slot) continue; // this agent's panel is not on the page
            clearTimeout(pending.get(slot));
            pending.set(slot, setTimeout(() => { pending.delete(slot); redraw(slot); }, 150));
        }
    };
    // After a gap every section on the page is redrawn from the server.
    const resync = () => document.querySelectorAll('[data-meta-section][id^="agent-meta-"]').forEach(slot => redraw(slot));
    window.hyperLive.subscribe({ name: 'agent-meta', types: ['ui.metaSection'], onEvent, resync });
})();
