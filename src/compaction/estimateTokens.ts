/**
 * Estimate transcript tokens without treating encoded image bytes as text
 *
 * Use for local compaction thresholds and before/after estimates, not billing. With a model whose tokenizer is public and already loaded (compaction.tokenizer), text and tool-call JSON are counted by that tokenizer plus 4 tokens of framing per message; otherwise they use a chars/4 heuristic. Each recognized image or image attachment reference reserves 4096 vision tokens independent of base64 size, URL length or compression. Unknown blocks and opaque checkpoints retain their serialized-text estimate. Provider calibration is applied by callers, not here.
 * @param opts.messages Canonical messages to measure, including text, multimodal blocks and tool calls.
 * @param opts.model Provider-qualified model route whose tokenizer should count text; omitted keeps the chars/4 heuristic.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Canonical messages to measure, including text, multimodal blocks and tool calls. */
        messages: Array<{ role: string; content?: unknown; tool_calls?: unknown[]; message_type?: string }>;
        /** Provider-qualified model route whose tokenizer should count text; omitted keeps the chars/4 heuristic. */
        model?: string;
    },
): Promise<number> {
    // A tokenizer that is still loading returns null; the heuristic covers that request.
    const count = opts.model ? await ctx.fns.compaction.tokenizer({ model: opts.model }) : null;
    const measure = count ?? ((text: string) => text.length);
    let units = 0, images = 0;
    const contentUnits = (content: unknown): number => {
        if (typeof content === "string") return measure(content);
        if (Array.isArray(content)) return content.reduce((sum: number, part: unknown) => sum + contentUnits(part), 0);
        if (content == null) return 0;
        if (typeof content === "object") {
            const part = content as Record<string, unknown>;
            if (["image", "image_url", "input_image", "image_ref"].includes(String(part.type))) {
                images++;
                return 0;
            }
            // Text blocks count their text; the block wrapper is part of the per-message framing.
            if (count && typeof part.text === "string" && Object.keys(part).every(k => k === "type" || k === "text" || k === "cache_control")) return count(part.text);
        }
        return measure(JSON.stringify(content) ?? "");
    };
    for (const message of opts.messages) {
        const calls = message.tool_calls?.length ? JSON.stringify(message.tool_calls) : "";
        units += contentUnits(message.content) + (count ? (calls ? count(calls) : 0) + 4 : JSON.stringify(message.tool_calls ?? []).length);
    }
    return (count ? units : Math.ceil(units / 4)) + images * 4096;
}
