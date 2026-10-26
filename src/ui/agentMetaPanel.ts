/**
 * Render the agent inspector with Work, Context and Settings tabs.
 *
 * Keeps all seven live section slots mounted in a static shell, so independent
 * RPC redraws preserve tab selection, form drafts and scroll position. The same
 * panel nodes serve the full-height desktop rail and the mobile full-screen dialog.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Agent associated with the operation. */ agent: types.agent.Agent;
    /** Direct delegated children with their existing plans. */ team?: Array<{ id: string; title: string; runState: string; status: string; plan: any; summary: string | null; updatedAt: number; archivedAt?: number | null }>;
    /** Archived delegated children displayed by the Team filter. */ archivedTeam?: Array<{ id: string; title: string; runState: string; status: string; plan: any; summary: string | null; updatedAt: number; archivedAt?: number | null }>;
    /** Models grouped by provider, used by the parked-agent switcher. */ models?: Record<string, string[]>;
    /** Credential accounts with their quota, used by the parked-agent switcher. */ accounts?: Array<{ provider: string; account: string; label: string; model: string; available: boolean; usedPercent: number | null; resetsAt: number | null; parkedAgents: number }>;
    /** Disabled exact model routes; omitted means no policy exclusions. */ disabledModels?: string[];
    /** Active durable wake, cron and condition triggers for this agent. */ triggers?: any[];
    /** Trusted HTML blocks answered by the `ui.agentSettings` point, appended to the settings section. */ extraSettings?: string[];
    /** Current global automatic compaction percentage, resolved by the page route. */ globalCompactionPercent?: number;
    /** Render the inspector as its collapsed rail. */ collapsed?: boolean }): string {
    const esc = (s: any) => ctx.fns.procs.ui.escape({ text: s });
    const agent = opts.agent;
    const slot = (section: "compaction" | "goal" | "knowledge" | "automation" | "settings" | "team" | "plan") =>
        `<div id="agent-meta-${section}-${esc(agent.id)}" data-meta-section="${section}">`
        + ctx.fns.ui.agentMetaSection({ agent, section, team: opts.team, archivedTeam: opts.archivedTeam, models: opts.models, accounts: opts.accounts, disabledModels: opts.disabledModels, triggers: opts.triggers, extraSettings: opts.extraSettings, globalCompactionPercent: opts.globalCompactionPercent })
        + `</div>`;
    const tabs = [{ key: 'work', label: 'Работа' }, { key: 'context', label: 'Контекст' }, { key: 'settings', label: 'Настройки' }];
    const pane = (key: string, html: string) => `<div id="agent-inspector-pane-${key}-${esc(agent.id)}" data-agent-inspector-pane="${key}" role="tabpanel" aria-labelledby="agent-inspector-tab-${key}-${esc(agent.id)}" tabindex="0"${key === 'work' ? '' : ' hidden'}>${html}</div>`;
    const collapsed = opts.collapsed === true;
    return `<aside id="agent-meta-${esc(agent.id)}" data-agent-meta-panel class="agent-meta-panel${collapsed ? ' agent-meta-collapsed' : ''} flex h-full w-80 shrink-0 flex-col overflow-hidden border-l border-ui-border text-base-content">
      <header data-mobile-inspector-header>
        <button type="button" data-mobile-inspector-close aria-label="Назад в чат"><i class="ph ph-arrow-left" aria-hidden="true"></i><span>Назад</span></button>
        <div><h2 id="mobile-inspector-title-${esc(agent.id)}">Инспектор чата</h2><p>${esc(agent.title || agent.id)}</p></div>
      </header>
      <header data-desktop-inspector-header class="flex h-9 shrink-0 items-center gap-2 border-b border-ui-border px-2">
        ${ctx.fns.procs.ui.button({ action: 'toggle-agent-meta', html: '<i class="ph ph-sidebar-simple" aria-hidden="true"></i>', appearance: 'plain', title: collapsed ? 'Expand agent inspector' : 'Collapse agent inspector', ariaLabel: collapsed ? 'Expand agent inspector' : 'Collapse agent inspector', class: 'agent-meta-toggle flex size-7 shrink-0 items-center justify-center rounded-full text-faint transition hover:bg-base-100/55 hover:text-base-content', attrs: { 'data-agent-meta-toggle': true, 'aria-expanded': String(!collapsed) } })}<span data-agent-meta-label class="min-w-0 flex-1 truncate text-xs font-semibold text-base-content">Agent inspector</span>${ctx.fns.auth?.onlineRegion?.({ agentId: agent.id }) ?? ""}<span data-agent-meta-label class="font-mono text-3xs text-faint">${esc(agent.id)}</span>
      </header>
      <div data-agent-inspector-tabs role="tablist" aria-label="Разделы инспектора">
        ${tabs.map(({ key, label }) => `<button type="button" id="agent-inspector-tab-${key}-${esc(agent.id)}" data-agent-inspector-tab="${key}" role="tab" aria-controls="agent-inspector-pane-${key}-${esc(agent.id)}" aria-selected="${key === 'work'}" tabindex="${key === 'work' ? '0' : '-1'}">${label}</button>`).join('')}
      </div>
      <div data-agent-meta-content class="flex-1 overflow-y-auto bg-transparent">
        ${pane('work', slot('plan') + slot('team') + slot('automation'))}
        ${pane('context', slot('goal') + slot('knowledge'))}
        ${pane('settings', slot('settings') + slot('compaction'))}
      </div>
    </aside>`;
}
