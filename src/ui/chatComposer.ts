/**
 * Render the shared Hyper chat composer for an agent or uncreated sidebar draft.
 *
 * Use for both existing chats and sidebar drafts; preserves attachments, keyboard controller and HTMX submission without creating an agent.
 * Mobile model and prompt controls share a collapsible settings row; context meters stay visible beside send.
 * Desktop keeps all controls inline in their original order. A controller-managed mobile return-to-latest
 * button floats above the composer without resizing the transcript or focusing the keyboard.
 * @param opts.action Same-origin submission path.
 * @param opts.controlsHtml Trusted existing agent stop/send controls; omitted uses a send button.
 * @param opts.statusHtml Trusted status-line popup markup; omitted for drafts.
 * @param opts.toolsHtml Trusted controls on the left of the toolbar under the text (model chip, plugin tools).
 * @param opts.metersHtml Trusted controls on the right of the toolbar, before send (context ring, plugin meters).
 * @param opts.aboveHtml Trusted chips shown above the text (prompt inject, plugin notes).
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Same-origin submission path. */
        action: string;
        /** Trusted existing agent stop/send controls; omitted uses a send button. */
        controlsHtml?: string;
        /** Trusted status-line popup markup; omitted for drafts. */
        statusHtml?: string;
        /** Trusted controls on the left of the toolbar under the text (model chip, plugin tools). */
        toolsHtml?: string;
        /** Trusted controls on the right of the toolbar, before send (context ring, plugin meters). */
        metersHtml?: string;
        /** Trusted chips shown above the text (prompt inject, plugin notes). */
        aboveHtml?: string;
    },
): Promise<string> {
    return `<form id="form"
          ${ctx.fns.procs.ui.attr({ form: "chat" })}
          class="chat-composer mx-auto w-[calc(100%-2rem)] max-w-3xl pb-2 pt-3"
          hx-post="${Bun.escapeHTML(opts.action)}"
          hx-trigger="submit"
          hx-encoding="multipart/form-data"
          hx-swap="none">
      <div data-chat-network hidden role="status" aria-live="polite">Нет соединения. Черновик остаётся здесь; автоматически ничего не отправится.</div>
      <div data-chat-send-error hidden role="status" aria-live="polite"><span data-chat-send-error-text></span> <button type="button" data-chat-retry>Повторить отправку</button> <button type="button" data-chat-cancel-retry>Не повторять</button></div>
      <div data-chat-jump-wrap>
        <button type="button" data-chat-jump hidden aria-controls="messages" aria-label="К последнему сообщению">
          <span>К последнему</span><span data-chat-jump-count hidden aria-hidden="true"></span><i class="ph ph-arrow-down" aria-hidden="true"></i>
        </button>
        <span data-chat-jump-status class="sr-only" role="status" aria-live="polite" aria-atomic="true"></span>
      </div>
      <input type="hidden" name="requestId" value="">
      <div data-attachments class="mb-2 hidden flex-wrap gap-2 rounded-xl border border-ui-border bg-base-100/70 p-2"></div>
      <div data-dictation-bar hidden class="mb-2 flex items-center gap-2 px-2 text-xs text-muted"><span data-dictation-status role="status" aria-live="polite"></span><button type="button" data-dictation-cancel class="ml-auto rounded px-2 py-1 hover:bg-base-200">Отменить</button></div>
      <div class="chat-box glass-input rounded-[22px] px-1.5 pb-1.5 pt-1">
        <div data-recording-panel hidden class="items-center gap-3 px-2 py-3" role="group" aria-label="Запись голосового сообщения">
          <span data-recording-time class="shrink-0 text-xs tabular-nums text-muted">0:00</span>
          <canvas data-recording-wave class="h-8 min-w-0 flex-1" aria-label="Уровень звука микрофона" role="img"></canvas>
          <button type="button" data-recording-stop class="flex size-9 shrink-0 items-center justify-center rounded-full bg-base-content text-base-100" aria-label="Остановить запись" title="Остановить запись"><i class="ph ph-stop" aria-hidden="true"></i></button>
        </div>
        ${opts.aboveHtml ? `<div data-chat-above class="flex min-w-0 flex-wrap items-center gap-1 px-2 pt-1">${opts.aboveHtml}</div>` : ""}
        <input id="files" name="files" type="file" multiple class="hidden" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/*,.md,.json,.xml,.html,.css,.js,.ts,.tsx,.jsx,.yml,.yaml,.csv,.log">
        <textarea id="input" name="text" rows="1" enterkeyhint="enter" aria-label="Message to agent" placeholder="Message agent…" title="Enter to send · Shift+Enter new line · ⌘J/K scroll · Ctrl J next unread"
          class="block max-h-[40vh] min-h-10 w-full resize-none overflow-y-auto bg-transparent [field-sizing:content] border-0 px-2.5 py-2 font-sans text-sm leading-[22px] text-base-content placeholder:text-faint focus:outline-none"></textarea>
        <div data-composer-toolbar class="flex min-w-0 items-center gap-1">
          <button type="button" data-attach-button class="flex size-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-base-200 hover:text-primary" title="Attach files" aria-label="Attach files"><i class="ph ph-plus"></i></button>
          ${opts.toolsHtml || opts.statusHtml ? '<button type="button" data-composer-settings-toggle class="hidden size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-base-200" aria-label="Параметры ответа" title="Модель, усилие и инструкции" aria-expanded="false" aria-controls="composer-settings"><i class="ph ph-sliders-horizontal" aria-hidden="true"></i></button>' : ''}
          <div id="composer-settings" data-composer-settings class="contents">
            <div data-chat-tools class="flex min-w-0 items-center gap-0.5">${opts.toolsHtml ?? ""}</div>
            <div data-chat-status class="flex shrink-0 items-center gap-0.5">${opts.statusHtml ?? ""}</div>
          </div>
          <div data-chat-meters class="ml-auto flex shrink-0 items-center gap-0.5">${opts.metersHtml ?? ""}</div>
          <button type="button" data-dictate class="flex size-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-base-200 hover:text-primary" title="Голосовой ввод" aria-label="Голосовой ввод" aria-pressed="false"><i class="ph ph-microphone" aria-hidden="true"></i></button>
          <div data-composer-submit class="flex shrink-0 items-center">${opts.controlsHtml ?? '<button type="submit" data-composer-send class="flex size-8 items-center justify-center rounded-full bg-base-content text-base-100" aria-label="Send message"><i class="ph ph-arrow-up text-base"></i></button>'}</div>
        </div>
      </div>
    </form>`;
}
