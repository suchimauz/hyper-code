/**
 * Convert SDK ordered input into Codex Responses input items
 *
 * SDK-owned Codex mapper: system messages become instructions (last wins); user text/image/PDF-document parts become input_text/input_image; assistant text becomes output_text followed by one function_call per tool call (call id, name, JSON arguments); tool results become function_call_output with attached images as a following user message; CheckpointEntry items become the native compaction item at their exact position. Rejects malformed checkpoints and legacy codex_compaction transcript records with INVALID_INPUT, without echoing encrypted content.
 * @param opts.messages Ordered SDK input: chat messages and checkpoint entries.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Ordered SDK input: chat messages and checkpoint entries. */
        messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
    },
): { instructions: string; input: Record<string, unknown>[] } {
    type Part = { type: string; text?: string; data?: string; mimeType?: string; fileName?: string; path?: string; extractedText?: string };
    const invalid = (message: string) => ctx.fns.models.failure({ message, status: 400, info: { code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
    const parts = (content: unknown): Part[] => {
        if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
        if (!Array.isArray(content)) return content == null ? [] : [{ type: "text", text: JSON.stringify(content) }];
        return (content as Part[]).filter(p => p?.type === "text" && typeof p.text === "string"
            || p?.type === "image" && typeof p.data === "string" && typeof p.mimeType === "string"
            || p?.type === "document" && typeof p.fileName === "string");
    };
    const asText = (list: Part[]): string[] => list.flatMap(p => p.type === "text" ? [p.text!]
        : p.type === "document" ? [`[Attached PDF: ${p.fileName}${p.path ? `\nLocal path: ${p.path}` : ""}]${p.extractedText ? `\n\n${p.extractedText}` : ""}`]
        : []);
    const image = (p: Part) => ({ type: "input_image", detail: "auto", image_url: `data:${p.mimeType};base64,${p.data}` });
    let instructions = "";
    const input: Record<string, unknown>[] = [];
    opts.messages.forEach((raw, index) => {
        const m = raw as Record<string, any>;
        if (m?.type === "checkpoint") {
            const item = m.checkpoint?.payload;
            if (!item || item.type !== "compaction" || typeof item.encrypted_content !== "string" || !item.encrypted_content || (item.id !== undefined && typeof item.id !== "string"))
                throw invalid(`Input ${index}: malformed Codex checkpoint`);
            input.push({ type: "compaction", ...(item.id ? { id: item.id } : {}), encrypted_content: item.encrypted_content });
            return;
        }
        if (m?.message_type === "codex_compaction") throw invalid(`Input ${index}: legacy codex_compaction records are not SDK input; pass a checkpoint entry`);
        if (m?.role === "system") { instructions = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""); return; }
        if (m?.role === "tool") {
            const content = parts(m.content);
            const text = asText(content).join("\n");
            input.push({ type: "function_call_output", call_id: m.tool_call_id, output: text || "(image attached below)" });
            for (const p of content) if (p.type === "image") input.push({ type: "message", role: "user", content: [image(p)] });
            return;
        }
        if (m?.role === "user") {
            const content = parts(m.content).map(p => p.type === "image" ? image(p) : { type: "input_text", text: p.type === "document" ? asText([p])[0] : p.text });
            if (content.length) input.push({ type: "message", role: "user", content });
            return;
        }
        if (m?.role === "assistant") {
            const text = typeof m.content === "string" ? m.content : "";
            if (text) input.push({ type: "message", role: "assistant", content: [{ type: "output_text", text }] });
            for (const call of (Array.isArray(m.tool_calls) ? m.tool_calls : []) as { id?: unknown; name?: unknown; args?: unknown }[])
                input.push({ type: "function_call", call_id: call.id, name: call.name, arguments: JSON.stringify(call.args ?? {}) });
        }
    });
    return { instructions, input };
}
