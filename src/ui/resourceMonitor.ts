/**
 * Render the server resource monitor and its compact chat footer trigger
 *
 * Use once in an agent chat column. The browser docks the same accessible panel below the visible inspector or opens it above the compact footer when the inspector is hidden. Values are loaded from the authenticated snapshot route, never fabricated at render time.
 * @param opts.agentId Agent identifier used only to namespace accessible panel and disclosure IDs.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent identifier used only to namespace accessible panel and disclosure IDs. */
        agentId: string;
    },
): Promise<string> {
    const id = ctx.fns.procs.ui.escape({text:opts.agentId});
    return `<div data-resource-dock hidden>
    <button type="button" class="resource-mini" data-resource-open aria-expanded="false" aria-controls="resource-panel-${id}" aria-label="Ресурсы сервера: показать всю машину и Hyper"><span data-resource-mini>CPU — · RAM — · Swap —</span><span data-resource-mini-state>загрузка…</span></button>
    <section id="resource-panel-${id}" class="resource-panel" data-resource-panel role="region" aria-labelledby="resource-title-${id}" hidden>
    <header class="resource-heading"><h2 id="resource-title-${id}">Ресурсы сервера</h2><button type="button" data-resource-close aria-label="Закрыть ресурсы сервера">×</button></header>
    <div class="resource-host"><span data-resource-host>Сервер Hyper</span><span data-resource-fresh>загрузка…</span></div>
    <div class="resource-columns"><span></span><span>Вся машина</span><span>Hyper</span></div>
    ${["CPU","Memory","Swap"].map((label,i)=>`<div class="resource-metric" data-resource-metric="${["cpu","memory","swap"][i]}"><div class="resource-values"><span>${label}</span><span data-resource-machine>—</span><span data-resource-hyper>—</span></div><div class="resource-bar" aria-hidden="true"><span data-resource-own-bar></span><span data-resource-other-bar></span></div></div>`).join("")}
    <p class="resource-status" data-resource-status role="status" hidden></p>
    <details class="resource-detail"><summary><span data-resource-count>Процессы Hyper</span><span data-resource-basis>CPU: вся машина = 100%</span></summary><div class="resource-detail-body"><table><caption class="sr-only">Вклад групп процессов Hyper</caption><thead><tr><th scope="col">Группа</th><th scope="col">CPU</th><th scope="col">Memory</th><th scope="col">Swap</th></tr></thead><tbody data-resource-groups></tbody></table><p>Hyper — сервер и его дочерние процессы на этой машине. Отдельный Postgres и удалённые задачи не включены.</p><p data-resource-memory-basis></p><p data-resource-note></p></div></details>
    </section></div>`;
}
