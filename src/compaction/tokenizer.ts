import { Tiktoken } from "js-tiktoken/lite";
import { Tokenizer } from "@huggingface/tokenizers";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
/**
 * Returns a cached local token counter for a model, loading its tokenizer in the background
 *
 * Use to count text tokens with the model's own tokenizer when one is public: o200k_base for OpenAI GPT/Codex (bundled), Kimi tiktoken and Hugging Face tokenizer.json files for Qwen, Gemma, DeepSeek, GLM and MiniMax (downloaded once into ~/.hyper/cache/tokenizers). Returns null for Claude or unknown models, while a tokenizer is still loading, or after a load failure (retried at most every 10 minutes), so callers fall back to the heuristic estimate.
 * @param opts.model Provider-qualified model route whose tokenizer is requested.
 * @param opts.wait Await a pending load instead of returning null immediately; for tests and warm-up. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-qualified model route whose tokenizer is requested. */
        model: string;
        /** Await a pending load instead of returning null immediately; for tests and warm-up. @default false */
        wait?: boolean;
    },
): Promise<((text: string) => number) | null> {
    const spec = await ctx.fns.compaction.tokenizerFor({ model: opts.model });
        if (spec.kind === 'none') return null;
        const key = spec.kind === 'tiktoken-o200k' ? 'o200k_base' : spec.repo!;
        const state = (((ctx.state as any).compaction ??= {}) as types.compaction.State);
        const cache = (state.tokenizers ??= {});
        const entry = (cache[key] ??= {});
        if (entry.count) return entry.count;
        if (entry.loading) { if (opts.wait) await entry.loading; return entry.count ?? null; }
        // A failed download is retried at most once per 10 minutes; meanwhile callers keep the heuristic.
        if (entry.failedAt && Date.now() - entry.failedAt < 600_000) return null;
        const dir = join(String(ctx.env.HOME || homedir()), '.hyper', 'cache', 'tokenizers', key.replace(/[^\w.-]+/g, '__'));
        const file = async (name: string) => {
            const path = join(dir, name);
            try { return await readFile(path, 'utf8'); } catch { /* not cached yet */ }
            const res = await fetch('https://huggingface.co/' + spec.repo + '/resolve/main/' + name, { signal: AbortSignal.timeout(120_000) });
            if (!res.ok) throw new Error(name + ': HTTP ' + res.status);
            const text = await res.text();
            await mkdir(dir, { recursive: true });
            await writeFile(path, text);
            return text;
        };
        // BPE cost grows quadratically within one pre-token, so whitespace-free runs over 128 chars
        // (base64, minified code) are counted in 128-char pieces; off by a few tokens at most.
        // Repeated long texts hit a per-tokenizer memo.
        const memo = new Map<number | bigint, number>();
        const wrap = (raw: (text: string) => number) => (text: string): number => {
            if (!text) return 0;
            const id = text.length > 256 ? Bun.hash(text) : null;
            const hit = id === null ? undefined : memo.get(id);
            if (hit !== undefined) return hit;
            let n = 0;
            // split with a capture group: odd indices are the long runs.
            text.split(/(\S{129,})/).forEach((part, index) => {
                const step = index % 2 ? 128 : 4000;
                for (let i = 0; i < part.length; i += step) n += raw(part.slice(i, i + step));
            });
            if (id !== null) { if (memo.size > 20000) memo.clear(); memo.set(id, n); }
            return n;
        };
        const load = async () => {
            if (spec.kind === 'tiktoken-o200k') {
                const ranks = (await import('js-tiktoken/ranks/o200k_base')).default;
                const enc = new Tiktoken(ranks);
                entry.count = wrap((text) => enc.encode(text, 'all').length);
            } else if (spec.kind === 'tiktoken-kimi') {
                // tiktoken.model lines are "<base64> <rank>"; js-tiktoken wants "! <offset> <base64>..." rows.
                const lines = (await file('tiktoken.model')).split('\n').filter(Boolean).map(l => l.split(' '));
                const rows = lines.map(([b64, rank]) => '! ' + rank + ' ' + b64).join('\n');
                // Kimi's pattern from tokenization_kimi.py; JS has no class intersection, so Han is excluded by lookahead.
                const notHan = '(?!\\p{Script=Han})';
                const up = '(?:' + notHan + '[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}])', low = '(?:' + notHan + '[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}])';
                const suf = "(?:'[sS]|'[tT]|'[rR][eE]|'[vV][eE]|'[mM]|'[lL][lL]|'[dD])?";
                const pat_str = ['[\\p{Script=Han}]+', '[^\\r\\n\\p{L}\\p{N}]?' + up + '*' + low + '+' + suf, '[^\\r\\n\\p{L}\\p{N}]?' + up + '+' + low + '*' + suf, '\\p{N}{1,3}', ' ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*', '\\s*[\\r\\n]+', '\\s+(?!\\S)', '\\s+'].join('|');
                const enc = new Tiktoken({ pat_str, special_tokens: {}, bpe_ranks: rows });
                entry.count = wrap((text) => enc.encode(text, 'all').length);
            } else {
                const tok = new Tokenizer(JSON.parse(await file('tokenizer.json')), JSON.parse(await file('tokenizer_config.json')));
                entry.count = wrap((text) => tok.encode(text, { add_special_tokens: false }).ids.length);
            }
        };
        entry.loading = load().catch((error: unknown) => {
            entry.failedAt = Date.now();
            ctx.fns.procs.log.warn({ event: 'compaction.tokenizer', msg: 'Tokenizer ' + key + ' unavailable: ' + (error instanceof Error ? error.message : String(error)) });
        }).finally(() => { entry.loading = undefined; });
        if (opts.wait) await entry.loading;
        return entry.count ?? null;
}
