/** Render a read-first execution task disclosure with retained form fields and pending-task controls. */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Execution task, including stable identity, title, instructions, status and elapsed time. */ task: any;
    /** Open the new task editor and focus its title. @default false */ autofocus?: boolean;
}): string {
    const esc = (s: any) => ctx.fns.procs.ui.escape({ text: s });
    const task = opts.task ?? {};
    const status = String(task.status ?? 'pending');
    const active = status === 'active';
    const label = status === 'done' ? 'Done' : active ? 'In progress' : status === 'pending' ? 'Pending' : status;
    const elapsed = Math.max(0, Number(task.elapsedMs ?? 0)) + (active && task.activeSince ? Math.max(0, Date.now() - Number(task.activeSince)) : 0);
    const seconds = Math.floor(elapsed / 1000);
    const time = seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
    const controls = status === 'pending' ? `<div class="inspector-task-actions">${ctx.fns.procs.ui.button({ action: 'move-plan-task-up', label: 'Move up', type: 'button', tone: 'default', size: 'xs', attrs: { 'data-plan-move': 'up' } })}${ctx.fns.procs.ui.button({ action: 'move-plan-task-down', label: 'Move down', type: 'button', tone: 'default', size: 'xs', attrs: { 'data-plan-move': 'down' } })}${ctx.fns.procs.ui.button({ action: 'remove-plan-task', label: 'Remove', type: 'button', tone: 'danger', size: 'xs', ariaLabel: 'Remove task', attrs: { 'data-plan-remove': true } })}</div>` : '';
    return `<details id="plan-task-${esc(task.id)}" data-plan-task data-task-id="${esc(task.id)}" data-task-status="${esc(status)}" data-inspector-disclosure="task-${esc(task.id)}" class="inspector-task inspector-disclosure inspector-surface-row" ${opts.autofocus ? 'open' : ''}>
      <summary><span class="inspector-task-indicator" aria-hidden="true"></span><span class="inspector-task-heading"><span data-plan-task-title class="inspector-task-title">${esc(task.title || 'Untitled task')}</span><span class="inspector-task-status">${esc(label)}${elapsed > 0 ? ` <span class="inspector-task-time">· ${time}</span>` : ''}</span></span></summary>
      <div class="inspector-task-editor">
        <input type="hidden" name="task_id" value="${esc(task.id)}">
        <label class="inspector-field"><span>Task title</span><input name="task_title" maxlength="300" value="${esc(task.title ?? '')}" required ${opts.autofocus ? 'autofocus' : ''} placeholder="Task title"></label>
        <label class="inspector-field"><span>Instructions &amp; completion criteria</span><textarea name="task_instructions" maxlength="12000" rows="3" placeholder="Detailed instructions">${esc(task.instructions ?? '')}</textarea></label>
        <p class="inspector-task-identity">Task ID: <code>${esc(task.id)}</code></p>${controls}
      </div>
    </details>`;
}
