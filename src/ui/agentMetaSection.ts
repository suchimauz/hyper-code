// The right inspector panel is seven independent sections. Each one renders
// here, ONCE, so the full-page shell (ui.agentMetaPanel) and the pushed
// single-section redraw (ui.agentMetaSection) can never drift apart.
//
// Section headings stay visible inside the three tab panes. Only individual
// details are collapsible; innerMorph retains their open state and form drafts
// when a live update redraws one slot (see $script_meta.js).
/** Renders one section of the agent inspector panel. */
/**
 * Render one section of the agent meta panel as a standalone fragment.
 *
 * Shared by the initial panel render and by the per-section RPC redraw:
 * ui.agentMetaPanel composes all seven, and the client swaps exactly one when
 * the server pushes ui.metaSection for it.
 *
 * @param opts.agent Agent whose panel is rendered.
 * @param opts.section Which inspector section to render.
 * @param opts.team Direct delegated children, for the team section.
 * @param opts.archivedTeam Archived delegated children, for the team section.
 * @param opts.models Models grouped by provider, for the parked-agent switcher.
 * @param opts.accounts Credential accounts with quota, for the parked-agent switcher.
 * @param opts.disabledModels Disabled exact routes to exclude from recovery actions.
 * @param opts.extraSettings Trusted HTML blocks answered by the `ui.agentSettings` point, appended to the settings section.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Agent whose panel is rendered. */
    agent: types.agent.Agent;
    /** Section to render. */
    section: "compaction" | "goal" | "knowledge" | "automation" | "settings" | "team" | "plan";
    /** Current global compaction percentage resolved by the page or RPC caller. */
    globalCompactionPercent?: number;
    /** Active durable wake, cron and condition triggers for this agent. */
    triggers?: any[];
    /** Direct delegated children with their existing plans. */
    team?: Array<{ id: string; title: string; runState: string; status: string; plan: any; summary: string | null; updatedAt: number; archivedAt?: number | null }>;
    /** Archived delegated children displayed by the Team filter. */
    archivedTeam?: Array<{ id: string; title: string; runState: string; status: string; plan: any; summary: string | null; updatedAt: number; archivedAt?: number | null }>;
    /** Models grouped by provider, used by the parked-agent switcher. */
    models?: Record<string, string[]>;
    /** Disabled exact model routes; omitted means no policy exclusions. */
    disabledModels?: string[];
    /** Credential accounts with their quota, used by the parked-agent switcher. */
    accounts?: Array<{ provider: string; account: string; label: string; model: string; available: boolean; usedPercent: number | null; resetsAt: number | null; parkedAgents: number }>;
    /** Trusted HTML blocks answered by `ui.agentSettings`, appended to the settings section. */
    extraSettings?: string[];
}): string {
    const esc = (s: any) => ctx.fns.procs.ui.escape({ text: s });
    const agent = opts.agent;
    // Inspector-only tones keep status meaning consistent without changing global badges.
    const statusBadge = (o: { label: string; tone?: string; dot?: boolean }) => `<span class="inspector-status-badge" data-tone="${({ info: 'active', warning: 'waiting', error: 'danger', success: 'success', active: 'active', waiting: 'waiting', danger: 'danger' } as Record<string, string>)[o.tone ?? ''] ?? 'neutral'}">${esc(o.label)}</span>`;
    const stateTone = (status: string) => /^(active|checking|running|working)$/.test(status) ? 'active' : /^(done|completed|ready|success|fired)$/.test(status) ? 'success' : /^(failed|error|blocked)$/.test(status) ? 'danger' : /^(pending|waiting|retrying)$/.test(status) ? 'waiting' : 'neutral';
    const toggle = (o: { name: string; enabled: boolean; label?: string; hint?: string; title?: string }) => ctx.fns.ui.toggle(o).replace('<input ', `<span class="inspector-toggle-state inspector-status-badge" data-tone="${o.title === 'Requires Function RAG' ? 'neutral' : o.enabled ? 'success' : 'neutral'}" aria-hidden="true">${o.title === 'Requires Function RAG' ? 'Недоступно' : o.enabled ? 'Вкл.' : 'Выкл.'}</span><input `);
    const progressBar = ctx.fns.ui.progressBar ?? ((o: any) => `<progress value="${Number(o.value)}" max="${Math.max(1, Number(o.max))}"></progress>`);
    const inspectorSection = (o: Parameters<Context['fns']['ui']['inspectorSection']>[0]) => ctx.fns.ui.inspectorSection
        ? ctx.fns.ui.inspectorSection({ ...o, collapsible: false })
        : `<section><header><h3>${esc(o.title)}</h3>${o.badge ?? ''}${o.actions ?? ''}</header><div>${o.html}</div></section>`;
    const id = encodeURIComponent(agent.id);

    if (opts.section === "compaction") {
        const inherited = agent.autoCompactWindowPercent == null;
        const globalPercent = Math.max(15, Math.min(95, opts.globalCompactionPercent ?? 65));
        const effective = inherited ? globalPercent : agent.autoCompactWindowPercent!;
        // Stable identity preserves an in-progress draft across live redraws.
        const inputId = `compaction-percent-${agent.id}`;
        const hintId = `compaction-hint-${agent.id}`;
        return inspectorSection({ title: "Compaction", icon: "arrows-in", collapsible: true, open: false, badge: `<span>${esc(effective)}% · ${inherited ? 'global' : 'custom'}</span>`, html: `
          <p class="inspector-help" role="status">${inherited ? `Following global setting: ${esc(globalPercent)}%.` : `Agent override: ${esc(effective)}%. Global setting: ${esc(globalPercent)}%.`}</p>
          <div class="inspector-compaction-row inspector-row"><form data-compaction-form data-compaction-saved="${esc(effective)}" hx-post="/agent/${id}/compaction" hx-swap="none" class="inspector-compaction-edit">
            <label for="${esc(inputId)}" class="block text-xs font-normal">Threshold (%)</label>
            <input id="${esc(inputId)}" name="percent" type="number" min="15" max="95" step="any" required value="${esc(effective)}" aria-describedby="${esc(hintId)}" class="input input-bordered input-sm w-full text-xs" />
            <details class="inspector-compaction-hint inspector-disclosure" data-inspector-disclosure="compaction-limits"><summary>Limits</summary><p id="${esc(hintId)}" class="inspector-help">15–95%. Automatic compaction may happen earlier at the global token limit. If the model's context window is unknown, only that token limit applies.</p></details>
            <span data-compaction-apply hidden>${ctx.fns.procs.ui.button({ label: 'Apply', type: 'submit', size: 'xs', tone: 'default', action: 'apply-compaction', disabled: true })}</span>
          </form>
          ${!inherited && effective !== globalPercent ? `<form data-compaction-form data-compaction-reset="${esc(globalPercent)}" hx-post="/agent/${id}/compaction" hx-swap="none" class="inspector-compaction-reset">
            <input type="hidden" name="action" value="inherit" />
            ${ctx.fns.procs.ui.button({ label: 'Reset', title: `Follow global setting (${globalPercent}%)`, type: 'submit', size: 'xs', tone: 'default', action: 'reset-compaction' })}
          </form>` : ''}</div>
          <p data-compaction-error role="alert" class="mt-2 text-xs text-error" hidden></p>` });
    }

    if (opts.section === "goal") {
        const enabled = agent.scratchpad?.goalTrackingEnabled === true;
        const preview = agent.scratchpad?.goalSidecar ?? null;
        const goals = Array.isArray(preview?.goals) ? preview.goals : [];
        const trackingToggle = `<form hx-post="/agent/${id}/goal-tracking" hx-swap="none" hx-trigger="change" class="mb-3">${toggle({ name: 'enabled', enabled, label: 'Track goals', hint: 'Run a display-only sidecar after new messages' })}</form>`;
        const tone = (status: string) => status === 'completed' ? 'success' : status === 'abandoned' ? 'neutral' : status === 'active' ? 'info' : 'warning';
        const sortedGoals = [...goals].sort((a: any, b: any) => Number(b?.sourceMessageIdx ?? 0) - Number(a?.sourceMessageIdx ?? 0));
        const currentGoals = sortedGoals.filter((item: any) => String(item?.status) !== 'completed');
        const completedGoals = sortedGoals.filter((item: any) => String(item?.status) === 'completed');
        const renderGoal = (item: any) => `<li class="inspector-goal-row inspector-row"><div class="inspector-goal-heading">${statusBadge({ label: String(item.status ?? 'candidate'), tone: tone(String(item.status ?? 'candidate')) })}<p class="inspector-goal-statement inspector-row-caption">${esc(item.statement)}</p></div><details class="inspector-disclosure" data-inspector-disclosure="goal-${esc(item.id)}"><summary>${item.verification ? 'Verification &amp; details' : 'Observation details'}</summary><div class="inspector-detail-body"><p class="inspector-detail">${esc(item.statement)}</p>${item.verification ? `<p class="inspector-help"><strong>Check:</strong> ${esc(item.verification)}</p>` : ''}<p class="inspector-task-identity">${esc(item.id)} · message ${Number(item.sourceMessageIdx ?? 0)}</p></div></details></li>`;
        const currentRows = currentGoals.length ? currentGoals.map(renderGoal).join('') : (!completedGoals.length ? '<li class="inspector-row inspector-help">No goals observed yet. Send a message after enabling tracking.</li>' : '');
        const completedRows = completedGoals.length ? `<details class="inspector-disclosure"><summary class="inspector-heading cursor-pointer text-subtle">Completed (${completedGoals.length})</summary><ol class="inspector-goal-list inspector-list">${completedGoals.map(renderGoal).join('')}</ol></details>` : '';
        const state = !enabled
            ? `<p class="inspector-help">Tracking is ${statusBadge({ label: 'off' })} for this agent.</p>`
            : preview?.status === 'error'
                ? `<p class="mt-2 text-3xs leading-4 text-error">${statusBadge({ label: 'Sidecar failed', tone: 'error' })}: ${esc(preview.error ?? 'unknown error')}</p>`
                : preview?.status === 'ready'
                    ? `<p class="inspector-help">Observed from message ${Number(preview.sourceMessageIdx ?? 0)}${preview.sidecarId ? ` · sidecar ${esc(preview.sidecarId)}` : ''}</p>`
                    : '<p class="inspector-help">Display-only preview; it does not affect agent execution.</p>';
        const body = `${trackingToggle}<h3 class="inspector-section-title">Current observations</h3><p class="inspector-help">Observed goals, not execution tasks.</p><ol class="inspector-goal-list inspector-list">${currentRows}</ol>${completedRows}${state}`;
        return inspectorSection({ title: 'Goals', icon: 'target', badge: statusBadge({ label: enabled ? String(goals.length) : 'off', tone: enabled && goals.length ? 'info' : 'neutral' }), html: body, collapsible: true, open: enabled });
    }


    if (opts.section === "knowledge") {
        // Rendered by the knowledge plugin when it is mounted; an empty slot otherwise.
        const render = (ctx.fns as any).knowledge?.agentMetaSection;
        return typeof render === "function" ? String(render({ agent }) ?? "") : inspectorSection({ title: 'Knowledge', icon: 'graph', collapsible: true, html: '<p class="inspector-help">Knowledge tracking is unavailable in this workspace. Enable the Knowledge plugin to observe entities and record their sources.</p>' });
    }
    if (opts.section === "automation") {
        const triggers = opts.triggers ?? [];
        const activeTriggers = triggers.filter((trigger: any) => trigger.status === "active" || trigger.status === "checking");
        const recentTriggers = triggers.filter((trigger: any) => trigger.status !== "active" && trigger.status !== "checking").slice(0, 10);
        const kindLabel: Record<string, string> = { at: "Wake-up", cron: "Schedule", watch: "Watch" };
        const renderTrigger = (trigger: any, active: boolean) => {
            const config = typeof trigger.config === "string" ? JSON.parse(trigger.config) : trigger.config ?? {};
            const detail = trigger.kind === "cron" ? `${config.expression ?? ""} · ${trigger.timezone ?? "UTC"}` : trigger.kind === "watch" ? `${config.predicate ?? "condition"} · ${trigger.mode}` : "one time";
            const when = trigger.nextAt ? `next ${new Date(Number(trigger.nextAt)).toLocaleString()}` : trigger.lastRunAt ? `last ${new Date(Number(trigger.lastRunAt)).toLocaleString()}` : trigger.status;
            const runError = trigger.lastRunError ?? trigger.lastError;
            let result = "";
            if (trigger.lastResult != null) { try { result = JSON.stringify(trigger.lastResult); } catch { result = String(trigger.lastResult); } }
            const inspection = runError ? `<div class="mt-1 break-words rounded bg-error/10 px-2 py-1 text-3xs text-error">${esc(runError)}</div>` : result && result !== "null" ? `<div class="mt-1 line-clamp-3 break-words rounded bg-base-200/60 px-2 py-1 font-mono text-micro text-subtle">${esc(result)}</div>` : "";
            const runNowButton = ctx.fns.procs.ui.button({ label: "Run now", name: "action", value: "run", type: "submit", tone: "default", size: "xs", action: "run-trigger" });
            const cancelButton = ctx.fns.procs.ui.button({ label: "Cancel", name: "action", value: "cancel", type: "submit", tone: "danger", size: "xs", action: "cancel-trigger" });
            const auditButton = ctx.fns.procs.ui.button({ label: trigger.attempts ? `Audit · ${trigger.attempts}` : "Audit", get: `/agent/${id}/trigger/${encodeURIComponent(String(trigger.id))}`, target: "#app-popup-body", swap: "innerHTML", tone: "default", size: "xs", action: "trigger-audit" });
            const controls = `<div class="mt-2 flex flex-wrap gap-1">${auditButton}${active ? `<form hx-post="/agent/${id}/triggers" hx-swap="none"><input type="hidden" name="triggerId" value="${esc(trigger.id)}">${runNowButton}</form><form hx-post="/agent/${id}/triggers" hx-swap="none"><input type="hidden" name="triggerId" value="${esc(trigger.id)}">${cancelButton}</form>` : ""}</div>`;
            return `<li class="inspector-row"><div class="flex items-center gap-2"><span class="text-3xs">${esc(kindLabel[trigger.kind] ?? trigger.kind)}</span><span class="truncate text-3xs text-faint">${esc(detail)}</span><span class="ml-auto">${statusBadge({ label: String(trigger.status), tone: stateTone(String(trigger.status)) })}</span></div><details class="inspector-disclosure"><summary>Prompt</summary><div class="inspector-detail-body"><p class="text-xs leading-5 text-muted">${esc(trigger.prompt)}</p></div></details><div class="mt-1 text-micro text-faint">${trigger.nextAt || trigger.lastRunAt ? esc(when) : statusBadge({ label: String(trigger.status), tone: stateTone(String(trigger.status)) })} · ${statusBadge({ label: String(trigger.lastOutcome ?? trigger.status), tone: stateTone(String(trigger.lastOutcome ?? trigger.status)) })}${trigger.attempts ? ` · ${esc(trigger.attempts)} attempts` : ''}</div>${inspection}${controls}</li>`;
        };
        const rows = activeTriggers.map((trigger: any) => renderTrigger(trigger, true)).join("");
        const history = recentTriggers.map((trigger: any) => renderTrigger(trigger, false)).join("");
        const wakeForm = `<form hx-post="/agent/${id}/triggers" hx-swap="none" class="space-y-2"><input type="hidden" name="action" value="wake"><label class="inspector-field"><span>Prompt</span><input name="prompt" value="Continue scheduled work" required class="input input-bordered input-sm w-full text-xs"></label><div class="flex flex-wrap items-end gap-2"><label class="inspector-field"><span>Delay (minutes)</span><input name="minutes" type="number" min="1" max="10080" value="5" class="input input-bordered input-sm w-20 text-xs"></label><span class="text-3xs text-faint">minutes</span>${ctx.fns.procs.ui.button({ label: '+ Wake-up', type: 'submit', tone: 'primary', size: 'xs', class: 'ml-auto', action: 'add-wake' })}</div></form>`;
        const cronForm = `<form hx-post="/agent/${id}/triggers" hx-swap="none" class="space-y-2"><input type="hidden" name="action" value="cron"><label class="inspector-field"><span>Prompt</span><input name="prompt" placeholder="Prompt" required class="input input-bordered input-sm w-full text-xs"></label><div class="grid grid-cols-1 gap-2"><label class="inspector-field"><span>Cron expression</span><input name="expression" value="0 9 * * *" required class="input input-bordered input-sm text-xs"></label><label class="inspector-field"><span>Time zone</span><input name="timezone" value="UTC" required class="input input-bordered input-sm text-xs"></label></div>${ctx.fns.procs.ui.button({ label: '+ Schedule', type: 'submit', tone: 'primary', size: 'xs', action: 'add-cron' })}</form>`;
        const watchForm = `<form hx-post="/agent/${id}/triggers" hx-swap="none" class="space-y-2"><input type="hidden" name="action" value="watch"><label class="inspector-field"><span>Prompt</span><input name="prompt" placeholder="Prompt when ready" required class="input input-bordered input-sm w-full text-xs"></label><div class="grid grid-cols-1 gap-2"><label class="inspector-field"><span>Condition</span><select name="predicate" class="select select-bordered select-sm text-xs"><option value="file.exists">File exists</option><option value="http.ok">HTTP OK</option><option value="db.rows">DB rows</option><option value="runtime.fn">Runtime function</option></select></label><label class="inspector-field"><span>Path, URL, SQL or function</span><input name="value" placeholder="path / URL / SQL / function" required class="input input-bordered input-sm text-xs"></label></div><div class="grid grid-cols-1 gap-2"><label class="inspector-field"><span>Check interval (seconds)</span><input name="everySeconds" type="number" min="5" value="60" title="Check every seconds" class="input input-bordered input-sm w-20 text-xs"></label><label class="inspector-field"><span>Timeout (minutes; 0 = none)</span><input name="timeoutMinutes" type="number" min="0" value="0" title="Timeout minutes; 0 means none" class="input input-bordered input-sm w-20 text-xs"></label><label class="inspector-field"><span>Repeat behavior</span><select name="mode" class="select select-bordered select-sm text-xs"><option value="once">Once</option><option value="edge">Every edge</option></select></label>${ctx.fns.procs.ui.button({ label: '+ Watch', type: 'submit', tone: 'primary', size: 'xs', class: 'ml-auto', action: 'add-watch' })}</div></form>`;
        const addPopupId = `agent-trigger-add-${String(agent.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        const addButton = ctx.fns.procs.ui.button({ label: "Add trigger", html: '<i class="ph ph-plus" aria-hidden="true"></i><span>Add trigger</span><i class="ph ph-caret-down text-3xs" aria-hidden="true"></i>', tone: "primary", size: "xs", action: "add-trigger", class: "mt-3 w-full justify-center gap-1.5", attrs: { popovertarget: addPopupId, "aria-haspopup": "dialog", style: `anchor-name:--${addPopupId}` } });
        const add = `${addButton}<div id="${esc(addPopupId)}" popover style="position-anchor:--${esc(addPopupId)}" class="inspector-trigger-popup inplace-popup-panel w-72 max-w-[calc(100vw-2rem)]"><div class="inspector-label mb-2 text-muted">New trigger</div><div class="space-y-2"><details class="inspector-disclosure inspector-row"><summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium"><i class="ph ph-alarm"></i><span>Wake-up</span><span class="ml-auto text-3xs text-faint">once</span></summary><div class="border-t border-ui-border p-3">${wakeForm}</div></details><details class="inspector-disclosure inspector-row"><summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium"><i class="ph ph-calendar-clock"></i><span>Schedule</span><span class="ml-auto text-3xs text-faint">cron</span></summary><div class="border-t border-ui-border p-3">${cronForm}</div></details><details class="inspector-disclosure inspector-row"><summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium"><i class="ph ph-eye"></i><span>Watch condition</span><span class="ml-auto text-3xs text-faint">event</span></summary><div class="border-t border-ui-border p-3">${watchForm}</div></details></div></div>`;
        const cancelAll = activeTriggers.length ? `<form hx-post="/agent/${id}/triggers" hx-swap="none" hx-confirm="Cancel all triggers?" class="mt-3">${ctx.fns.procs.ui.button({ label: 'Cancel all', name: 'action', value: 'cancelAll', type: 'submit', tone: 'danger', size: 'xs', action: 'cancel-all-triggers' })}</form>` : "";
        const parkedHtml = ctx.fns.ui.parkedCard?.({ agent, models: opts.models, accounts: opts.accounts, disabledModels: opts.disabledModels }) ?? "";
        return inspectorSection({ title: "Automation", icon: "lightning", badge: statusBadge({ label: activeTriggers.length ? `${activeTriggers.length} active` : 'off', tone: activeTriggers.length ? 'active' : 'neutral' }), html: `${parkedHtml}${parkedHtml ? '<div class="mt-2"></div>' : ''}<h3 class="inspector-section-title">Active triggers</h3>${rows ? `<ul class="inspector-list">${rows}</ul>` : '<p class="inspector-muted">No active triggers. Add a one-time wake-up, a recurring schedule, or a condition to check.</p>'}${cancelAll}${add}${history ? `<details class="inspector-disclosure inspector-row"><summary class="cursor-pointer text-2xs font-medium">Recent runs</summary><ul class="inspector-list">${history}</ul></details>` : ""}`, collapsible: true, open: !!parkedHtml });
    }

    if (opts.section === "settings") {
        // Sharing is visible before activation; the complete per-tool contract remains one disclosure away.
        const explanations: string[] = [];
        const advisory = (o: { label: string; name: string; enabled: boolean; hint: string }) => {
            explanations.push(`<p class="inspector-detail"><strong>${esc(o.label)}.</strong> ${esc(o.hint)}</p>`);
            return `<div class="inspector-row">${toggle({ ...o, hint: undefined })}</div>`;
        };
        const body = `<p class="inspector-warning">Jev sends data to an external provider. Do not include secrets.</p><form hx-post="/agent/${id}/automation" hx-swap="none" hx-trigger="change delay:200ms" class="space-y-3"><fieldset class="inspector-list"><legend class="inspector-section-title">Function retrieval</legend><p class="inspector-help">Gate and rerank require Function RAG.</p>${toggle({ label: 'Function RAG', name: 'functionRagEnabled', enabled: agent.functionRagEnabled === true, hint: undefined })}${toggle({ label: 'Pre-retrieval Gate', name: 'functionRagGateEnabled', enabled: agent.functionRagGateEnabled === true, hint: undefined, title: agent.functionRagEnabled === true ? '' : 'Requires Function RAG' })}${toggle({ label: 'Jev rerank', name: 'jevRerankEnabled', enabled: agent.jevRerankEnabled === true, hint: undefined, title: agent.functionRagEnabled === true ? '' : 'Requires Function RAG' })}</fieldset><fieldset class="inspector-list"><legend class="inspector-section-title">Context preservation</legend><input type="hidden" name="jevCompactionPresent" value="1">${advisory({ label: 'Jev compaction review', name: 'jevCompactionEnabled', enabled: agent.jevCompactionEnabled === true, hint: 'Off by default. Automatically sends bounded source excerpts, the proposed text summary and retained-tail text (including readable tool results) to the external configured Jev provider before compaction activates. Checks decisions, constraints and unfinished work; not a guarantee of complete preservation. A detected omission keeps the previous context; unavailable checks do not block compaction. Opaque native checkpoints are skipped. Independent of context filtering and Function RAG.' })}<input type="hidden" name="jevContextPresent" value="1">${advisory({ label: 'Jev context filtering', name: 'jevContextEnabled', enabled: agent.jevContextEnabled === true, hint: 'Off by default. Sends the latest request and excerpts of old tool results to the configured Jev provider. Independent of Function RAG.' })}</fieldset><fieldset class="inspector-list"><legend class="inspector-section-title">Jev advisory tools</legend><p class="inspector-help">Explicit advice only. Off by default; no automatic actions.</p><input type="hidden" name="jevAgentRoutingPresent" value="1">${advisory({ label: 'Jev executor recommendation', name: 'jevAgentRoutingEnabled', enabled: agent.jevAgentRoutingEnabled === true, hint: 'Off by default. agent.recommendExecutor sends task text and selected existing team member titles to the configured Jev provider. Advisory only: no automatic delegation or messages.' })}<input type="hidden" name="jevModelRoutingPresent" value="1">${advisory({ label: 'Jev model recommendation', name: 'jevModelRoutingEnabled', enabled: agent.jevModelRoutingEnabled === true, hint: 'Off by default and independent. Sends explicit task text and account-free model labels to configured Jev, even if Jev is outside the allowed model destinations. Do not include secrets. Advisory only: never switches models or starts jobs.' })}<input type="hidden" name="jevEvidencePresent" value="1">${advisory({ label: 'Evidence advice', name: 'jevEvidenceEnabled', enabled: agent.jevEvidenceEnabled === true, hint: 'Enables only an explicit advisory call sharing task text and supplied evidence with the external configured Jev provider. Independent of other toggles; no automatic actions.' })}<input type="hidden" name="jevFileRankingPresent" value="1">${advisory({ label: 'File ranking advice', name: 'jevFileRankingEnabled', enabled: agent.jevFileRankingEnabled === true, hint: 'Enables only an explicit advisory call sharing task text and file candidate metadata with the external configured Jev provider. Independent of other toggles; no automatic actions.' })}<input type="hidden" name="jevResultReviewPresent" value="1">${advisory({ label: 'Result review advice', name: 'jevResultReviewEnabled', enabled: agent.jevResultReviewEnabled === true, hint: 'Enables only an explicit advisory call sharing task text, proposed result and supplied evidence with the external configured Jev provider. Independent of other toggles; no automatic actions.' })}<input type="hidden" name="jevRiskReviewPresent" value="1">${advisory({ label: 'Action risk advice', name: 'jevRiskReviewEnabled', enabled: agent.jevRiskReviewEnabled === true, hint: 'Enables only an explicit advisory call sharing task text, proposed action and supplied metadata with the external configured Jev provider. Independent of other toggles; no automatic actions.' })}<details data-inspector-disclosure="jev-sharing" class="inspector-disclosure"><summary>Jev data sharing &amp; behavior</summary><div class="inspector-help"><p>Rerank shares retrieved function candidates. Gate uses local heuristics and requires Function RAG.</p>${explanations.join('')}</div></details></fieldset></form>`;
        // Everything above is the framework's own state, read off the agent
        // row. A plugin's switch is not, so it answers `ui.agentSettings` with
        // its own form posting to its own route — collected by the caller,
        // because this renderer is synchronous and the point is async.
        const extra = (Array.isArray(opts.extraSettings) ? opts.extraSettings : [])
            .map((block: any) => String(block ?? "").trim()).filter(Boolean);
        const extraHtml = extra.length
            ? `<div class="mt-1 space-y-1 border-t border-ui-border pt-1">${extra.join('')}</div>`
            : '';
        return inspectorSection({ title: 'Agent settings', icon: 'sliders-horizontal', html: body + extraHtml, collapsible: true });
    }


    if (opts.section === "team") {
        const team = Array.isArray(opts.team) ? opts.team : [];
        const archivedTeam = Array.isArray(opts.archivedTeam) ? opts.archivedTeam : [];
        const allTeam = [...team, ...archivedTeam];
        if (!allTeam.length) return inspectorSection({ title: 'Team', icon: 'users-three', collapsible: true, html: '<p class="inspector-muted">No team yet. Ask the agent to delegate independent work.</p>' });
        return inspectorSection({
            title: 'Team', icon: 'users-three', badge: statusBadge({ label: String(team.length), tone: team.some((member: any) => member.status === 'failed' || member.status === 'blocked') ? 'error' : team.some((member: any) => member.status === 'working') ? 'info' : 'neutral' }), collapsible: true,
            open: team.some((member: any) => member.status === 'working' || member.status === 'blocked' || member.status === 'failed'), html: `<div data-team-section>
      ${archivedTeam.length ? `<label class="inspector-setting-row"><input type="checkbox" onchange="this.closest('[data-team-section]').querySelector('[data-team-archive-list]').classList.toggle('hidden', !this.checked)"> Show archived (${archivedTeam.length})</label>` : ''}
      <div class="inspector-list">${team.map((member: any) => {
                const memberTasks = Array.isArray(member.plan?.tasks) ? member.plan.tasks : [];
                const memberDone = memberTasks.filter((task: any) => task.status === 'done').length;
                const statusTone = member.status === 'ready' ? 'success' : member.status === 'failed' || member.status === 'blocked' ? 'error' : member.status === 'working' ? 'info' : 'neutral';
                const memberBadge = statusBadge({ label: String(member.status), tone: statusTone, dot: member.status === 'working' });
                return `<details data-inspector-disclosure="team-${esc(member.id)}" class="group inspector-disclosure inspector-row" ${member.status === 'working' ? 'open' : ''}>
          <summary class="flex min-h-10 cursor-pointer list-none items-center gap-2 px-2.5 py-2 hover:bg-base-200/60"><i class="ph ph-robot text-muted"></i><span class="inspector-row-title min-w-0 flex-1 truncate">${esc(member.title || `Agent ${member.id}`)}</span>${memberBadge}<span class="font-mono text-3xs tabular-nums text-faint">${memberDone}/${memberTasks.length} done</span><i class="ph ph-caret-down text-3xs text-faint transition-transform group-open:rotate-180"></i></summary>
          <div class="inspector-detail-body space-y-2">
            ${memberTasks.length ? progressBar({ value: memberDone, max: memberTasks.length, label: member.plan?.title || 'Task progress', showValue: false }) : ''}
            <div class="space-y-1.5">${memberTasks.map((task: any) => `<div class="text-2xs leading-4 ${task.status === 'done' ? 'text-faint' : task.status === 'active' ? 'text-muted' : 'text-subtle'}"><div class="flex items-start gap-1.5"><i class="ph ${task.status === 'done' ? 'ph-check-circle text-success' : task.status === 'active' ? 'ph-circle-notch animate-spin' : 'ph-circle'} mt-0.5"></i><span class="min-w-0 flex-1">${esc(task.title)}</span>${statusBadge({ label: String(task.status ?? 'pending'), tone: stateTone(String(task.status ?? 'pending')) })}</div>${task.resultSummary ? `<div class="ml-4 mt-0.5 text-subtle">${esc(task.resultSummary)}</div>` : ''}</div>`).join('')}</div>
            ${member.summary ? `<div class="mt-2 border-t border-ui-border pt-2 text-3xs leading-4 text-subtle">${esc(member.summary)}</div>` : ''}
            <div class="flex items-center gap-1 border-t border-ui-border pt-2">${ctx.fns.procs.ui.button({ action: 'open-team-member', href: `/agent/${encodeURIComponent(member.id)}`, html: '<i class="ph ph-arrow-square-out"></i> Open', tone: 'default', size: 'xs' })}${member.status === 'working' || member.runState === 'running' ? `<form hx-post="/agent/${id}/team/${encodeURIComponent(member.id)}/stop" hx-swap="none" hx-confirm="Stop this subagent?">${ctx.fns.procs.ui.button({ action: 'stop-team-member', type: 'submit', html: '<i class="ph ph-stop-circle"></i> Stop', appearance: 'plain', size: 'xs', class: 'rounded px-1.5 text-faint transition hover:bg-base-100/45 hover:text-muted' })}</form>` : ''}${member.status === 'blocked' || member.status === 'failed' ? `<form hx-post="/agent/${id}/team/${encodeURIComponent(member.id)}/retry" hx-swap="none">${ctx.fns.procs.ui.button({ action: 'retry-team-member', type: 'submit', html: '<i class="ph ph-arrow-clockwise"></i> Retry', tone: 'default', size: 'xs' })}</form>` : ''}${member.status !== 'working' && member.runState !== 'running' ? `<form hx-post="/agent/${id}/team/${encodeURIComponent(member.id)}/archive" hx-swap="none">${ctx.fns.procs.ui.button({ action: 'archive-team-member', type: 'submit', html: '<i class="ph ph-archive"></i> Archive', tone: 'default', size: 'xs' })}</form>` : ''}</div>
          </div>
        </details>`;
            }).join('')}</div>
      ${archivedTeam.length ? `<div data-team-archive-list class="mt-2 hidden space-y-2">${archivedTeam.map((member: any) => { const archivedTasks = Array.isArray(member.plan?.tasks) ? member.plan.tasks : []; return `<details data-inspector-disclosure="archived-team-${esc(member.id)}" class="inspector-disclosure inspector-row"><summary class="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2"><i class="ph ph-archive text-faint"></i><span class="min-w-0 flex-1 truncate text-xs text-muted">${esc(member.title || `Agent ${member.id}`)}</span><span class="text-3xs text-faint">${archivedTasks.filter((task: any) => task.status === 'done').length}/${archivedTasks.length}</span>${statusBadge({ label: 'archived' })}</summary><div class="inspector-detail-body"><div class="space-y-1">${archivedTasks.map((task: any) => `<div class="text-3xs leading-4 text-subtle"><div class="flex items-start gap-1.5"><i class="ph ${task.status === 'done' ? 'ph-check-circle' : 'ph-circle'} mt-0.5"></i><span class="min-w-0 flex-1">${esc(task.title)}</span>${statusBadge({ label: String(task.status ?? 'pending'), tone: stateTone(String(task.status ?? 'pending')) })}</div>${task.resultSummary ? `<div class="ml-4 mt-0.5 text-faint">${esc(task.resultSummary)}</div>` : ''}</div>`).join('')}</div>${member.summary ? `<div class="mt-2 border-t border-ui-border pt-2 text-3xs leading-4 text-subtle">${esc(member.summary)}</div>` : ''}<div class="mt-2 flex items-center gap-2"><form hx-post="/agent/${id}/team/${encodeURIComponent(member.id)}/unarchive" hx-swap="none" hx-on::after:request="if(event.detail.ctx?.response?.status < 400) location.href='/agent/${encodeURIComponent(member.id)}'">${ctx.fns.procs.ui.button({ action: 'restore-team-member', type: 'submit', html: '<i class="ph ph-arrow-counter-clockwise"></i> Restore &amp; open', appearance: 'plain', class: 'text-3xs text-primary hover:text-primary' })}</form></div></div></details>`; }).join('')}</div>` : ''}
      </div>` });
    }

    if (opts.section === "plan") {
        const plan = agent.scratchpad?.plan ?? null;
        const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
        if (!tasks.length) return inspectorSection({ title: 'Plan', icon: 'list-checks', collapsible: true, html: '<p class="inspector-muted">No plan yet. Ask the agent to plan the work.</p>' });
        const doneCount = tasks.filter((task: any) => task.status === 'done').length;
        const body = `<form data-plan-editor hx-post="/agent/${id}/plan" hx-swap="none" class="space-y-3"><input type="hidden" name="action" value="update"><div class="flex flex-wrap items-center gap-2"><details data-inspector-disclosure="plan-title" class="inspector-detail min-w-0 flex-1"><summary class="inspector-row-title"><span class="min-w-0 flex-1">${esc(plan.title || 'Untitled plan')}</span><span class="shrink-0 inspector-muted">Edit</span></summary><label class="inspector-field"><span>Plan title</span><input name="title" maxlength="300" value="${esc(plan.title || '')}" aria-label="Plan title" class="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-xs font-medium text-base-content outline-none focus:ring-0"></label><div class="inspector-task-actions mt-2">${ctx.fns.procs.ui.button({ action: 'archive-plan', label: 'Archive', type: 'submit', tone: 'default', size: 'xs', title: 'Archive plan', attrs: { form: `plan-archive-${id}` } })}${ctx.fns.procs.ui.button({ action: 'delete-plan', label: 'Delete', type: 'submit', tone: 'danger', size: 'xs', title: 'Delete plan', attrs: { form: `plan-delete-${id}` } })}</div></details></div><p class="inspector-muted">${doneCount} of ${tasks.length} tasks complete</p>${plan.pausedAt ? `<div class="rounded-md bg-warning/10 px-2 py-1 text-2xs text-warning">Paused by user</div>` : ''}<div id="plan-tasks-${esc(agent.id)}" data-plan-tasks class="inspector-task-list inspector-list">${tasks.map((task: any) => ctx.fns.ui.planTaskRow({ task })).join('')}</div><div class="flex items-center gap-2">${ctx.fns.procs.ui.button({ action: 'add-plan-task', label: 'Add task' , get: `/ui/agent/${id}/plan/task`, target: `#plan-tasks-${esc(agent.id)}`, swap: 'beforeend', tone: 'default', size: 'xs', title: 'Add task', ariaLabel: 'Add task' })}<div class="h-px flex-1 bg-base-300"></div>${ctx.fns.procs.ui.button({ action: 'save-plan', label: 'Save plan', type: 'submit', tone: 'primary', size: 'xs' })}</div></form><form id="plan-archive-${id}" hx-post="/agent/${id}/plan" hx-swap="none" hx-confirm="Archive this plan?"><input type="hidden" name="action" value="archive"></form><form id="plan-delete-${id}" hx-post="/agent/${id}/plan" hx-swap="none" hx-confirm="Delete this plan permanently?"><input type="hidden" name="action" value="delete"></form>`;
        return inspectorSection({ title: 'Plan', icon: 'list-checks', badge: statusBadge({ label: `${doneCount}/${tasks.length}`, tone: doneCount === tasks.length ? 'success' : 'info' }), html: body, collapsible: true, open: tasks.some((task: any) => task.status === 'active') });
    }

    throw new Error(`agentMetaSection: unknown section "${String(opts.section)}" — expected goal, automation, wake, team or plan`);
}
