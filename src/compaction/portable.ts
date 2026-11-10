// Native checkpoints follow the upstream provider/model identity, not the transport.

const SUMMARY_PREFIX = "Another language model started to solve this problem and produced a summary of its thinking process. You also have access to the state of the tools that were used by that language model. Use this to build on the work that has already been done and avoid duplicating work. Here is the summary produced by the other language model, use the information in this summary to assist with your own analysis:";

/**
 * Adapts compaction checkpoint messages to the model that will read them
 *
 * Native checkpoints (`anthropic_compaction`, `codex_compaction`) are kept for the same upstream provider and model, ignoring account names and explicit SSH/MauzCode route wrappers. Unresolved route aliases are compatible only when identical. This is a routing compatibility policy, not verification that remote credentials can decrypt a checkpoint. For a different identity a Claude block becomes a plain text handoff summary (`compaction_summary`); an opaque Codex item returns null so callers fall back to the root transcript. Use wherever the active compact projection is assembled (buildLlmRequest, compactContext, autoCompactIfNeeded).
 * @param opts.model Provider-qualified model that will read the projection.
 * @param opts.producedBy Model recorded on the compaction generation that made the checkpoint.
 * @param opts.messages Checkpoint messages of the hidden compaction child.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Provider-qualified model that will read the projection. */
        model: string;
        /** Model recorded on the compaction generation that made the checkpoint. */
        producedBy?: string | null;
        /** Checkpoint messages of the hidden compaction child. */
        messages: { role: string; content?: unknown; message_type?: string }[];
    },
): { role: string; content?: unknown; message_type?: string }[] | null {
    // Resolve explicit routes offline: a failed SSH host must not prevent reuse.
    const identity = (model: string): string | null => {
        const route = /^([a-z][\w-]*)(?:\/[\w.-]+)?:(\S+)$/.exec(model);
        if (!route) return null;
        if (route[1] === "ssh" || route[1] === "mauzcode") {
            const upstream = /^([a-z][\w-]*)\/[\w.-]+:([^:\s]+)$/.exec(route[2]!);
            if (!upstream || upstream[1] === "ssh" || upstream[1] === "mauzcode") return null;
            if (route[1] === "ssh" && !["codex", "claude-code", "kimi-coding"].includes(upstream[1]!)) return null;
            return `${upstream[1]}:${upstream[2]}`;
        }
        if (route[2]!.includes(":")) return null;
        return `${route[1]}:${route[2]}`;
    };
    const target = identity(opts.model);
    const same = !!opts.producedBy && (opts.producedBy === opts.model
        || (target !== null && target === identity(opts.producedBy)));
    const out: { role: string; content?: unknown; message_type?: string }[] = [];
    for (const m of opts.messages) {
        if (m?.message_type === "anthropic_compaction") {
            if (same) { out.push(m); continue; }
            let block: any = null;
            try { block = typeof m.content === "string" ? JSON.parse(m.content) : m.content; } catch {}
            const text = typeof block?.content === "string" ? block.content.trim() : "";
            if (!text) return null;
            out.push({ role: "user", content: SUMMARY_PREFIX + "\n" + text, message_type: "compaction_summary" });
            continue;
        }
        if (m?.message_type === "codex_compaction") {
            if (same) { out.push(m); continue; }
            return null;
        }
        out.push(m);
    }
    return out;
}
