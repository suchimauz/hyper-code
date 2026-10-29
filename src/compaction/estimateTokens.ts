/**
 * Estimate transcript tokens without treating encoded image bytes as text
 *
 * Use for local compaction thresholds and before/after estimates, not billing. Text and tool-call JSON use a chars/4 heuristic. Each recognized image or image attachment reference reserves 4096 vision tokens independent of base64 size, URL length or compression. Unknown blocks and opaque checkpoints retain their serialized-text estimate. Actual provider usage must still be used as a lower bound when fresh; image cost varies by model and resolution.
 * @param opts.messages Canonical messages to measure, including text, multimodal blocks and tool calls.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Canonical messages to measure, including text, multimodal blocks and tool calls. */
        messages: Array<{ role: string; content?: unknown; tool_calls?: unknown[]; message_type?: string }>;
    },
): Promise<number> {
    let chars = 0, images = 0;
    const contentChars = (content: unknown): number => {
        if (typeof content === "string") return content.length;
        if (Array.isArray(content)) return content.reduce((sum: number, part: unknown) => sum + contentChars(part), 0);
        if (content == null) return 0;
        if (typeof content === "object") {
            const part = content as Record<string, unknown>;
            if (["image", "image_url", "input_image", "image_ref"].includes(String(part.type))) {
                images++;
                return 0;
            }
        }
        return (JSON.stringify(content) ?? "").length;
    };
    for (const message of opts.messages) {
        chars += contentChars(message.content) + JSON.stringify(message.tool_calls ?? []).length;
    }
    return Math.ceil(chars / 4) + images * 4096;
}
