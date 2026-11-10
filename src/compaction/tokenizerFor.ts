/**
 * Maps a model route to the local tokenizer that can count its tokens
 *
 * Use before counting tokens locally for a model. Resolves the last segment of a provider-qualified model route (ssh/ and mauzcode/ prefixes are ignored) to o200k_base for OpenAI GPT/Codex, a Kimi tiktoken vocabulary, a public Hugging Face tokenizer.json repository for Qwen, Gemma, DeepSeek, GLM and MiniMax, or none for Claude and unknown models, which keep the heuristic estimate plus provider calibration.
 * @param opts.model Provider-qualified model route such as ssh/aeza-criminal-amarant:codex/acc:gpt-6-astra or zai-coding:glm-5.3.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-qualified model route such as ssh/aeza-criminal-amarant:codex/acc:gpt-6-astra or zai-coding:glm-5.3. */
        model: string;
    },
): Promise<{ kind: 'tiktoken-o200k' | 'tiktoken-kimi' | 'hf' | 'none'; repo?: string }> {
    const id = String(opts.model ?? '').split(':').pop()!.toLowerCase();
        // Families with a public tokenizer; newer unpublished versions reuse the latest published one and calibration absorbs drift.
        if (/^(gpt-|o\d|codex)/.test(id)) return { kind: 'tiktoken-o200k' };
        if (/^(kimi|k\d)/.test(id)) return { kind: 'tiktoken-kimi', repo: 'moonshotai/Kimi-K3' };
        if (id.startsWith('qwen')) return { kind: 'hf', repo: 'Qwen/Qwen3.8-Flash-Next' };
        if (id.startsWith('gemma')) return { kind: 'hf', repo: 'google/gemma-4-26B-A4B-it' };
        if (id.startsWith('deepseek')) return { kind: 'hf', repo: 'deepseek-ai/DeepSeek-V4.1-Flash' };
        if (id.startsWith('glm')) return { kind: 'hf', repo: 'zai-org/GLM-5.3' };
        if (id.startsWith('minimax')) return { kind: 'hf', repo: 'MiniMaxAI/MiniMax-M3' };
        return { kind: 'none' };
}
