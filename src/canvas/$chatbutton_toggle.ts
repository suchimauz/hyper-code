// Chat header button: opens and closes the canvas left of the chat; /canvas/canvas.js handles the click and
// paints the pressed state.
export default {
    order: 10,
    render: (ctx: Context) => ctx.fns.procs.ui.button({
        action: "toggle-canvas",
        html: '<i class="ph ph-square-half" aria-hidden="true"></i><span class="chat-toolbar-label">Canvas</span>',
        appearance: "plain",
        ariaLabel: "Открыть Canvas",
        title: "Открыть Canvas",
        class: "canvas-toggle chat-toolbar-button",
        attrs: { "data-canvas-toggle": "toggle", "aria-pressed": "false" },
    }),
} satisfies types.chat.Button;
