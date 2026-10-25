type SearchEngine = 'brave' | 'google-browser' | 'openserp';

type SearchResult = {
    /** Result title as reported by the engine. */
    title: string;
    /** Result URL. */
    url: string;
    /** Snippet with engine highlight markup removed. */
    description: string;
    /** Original snippet including the engine's `<strong>` highlight markup, when it provided any. */
    descriptionHtml: string | null;
    /** Publication or crawl age reported by the engine, when available. */
    publishedAt: string | null;
    /** Language code reported by the engine, when available. */
    language: string | null;
    /** Site or profile label reported by the engine, when available. */
    site: string | null;
    /** Additional page excerpts returned by the engine; often enough to answer without opening the page. */
    extraSnippets: string[];
};

const stripTags = (value: string): string =>
    String(value ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

/**
 * Searches the public web through Brave, Google Browser or optional OpenSERP and returns normalized ranked links.
 *
 * Use this for retrieval-only web discovery. It does not open result pages or ask an LLM to summarize them.
 * Snippets are returned twice: `description` with the engine's highlight markup stripped, and `descriptionHtml` as the
 * engine sent it. Engine extras are preserved instead of discarded: `publishedAt` tells an agent whether a page is
 * current, and `extraSnippets` often answers the question without opening the page at all. Fields an engine does not
 * provide are null or empty rather than omitted. OpenSERP uses DuckDuckGo first, then Bing once on failure or
 * no usable results, with 10 seconds per request and a 20-second total request budget. It needs an operator-run
 * OpenSERP service but no browser or paid API. Page reading in websearch.answer/fetch still needs the browser.
 *
 * @param opts.query Search query sent to the selected engine.
 * @param opts.limit Maximum number of ranked results to return. @default 10 @minimum 1 @maximum 20
 * @param opts.engine Search backend; when omitted, uses the `websearch.defaultEngine` setting. @default google-browser
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Search query sent to the selected engine. */
        query: string;
        /** Maximum number of ranked results to return. @default 10 @minimum 1 @maximum 20 */
        limit?: number;
        /** Search backend; when omitted, uses the `websearch.defaultEngine` setting. @default google-browser */
        engine?: SearchEngine;
    },
): Promise<{ query: string; engine: SearchEngine; /** Actual OpenSERP provider used; absent for other backends. */ sourceEngine?: 'duckduckgo' | 'bing'; results: SearchResult[]; durationMs: number }> {
    const query = String(opts.query ?? '').trim();
    if (!query) throw new Error('websearch.search: query is required');
    const limit = Math.max(1, Math.min(20, Math.trunc(Number(opts.limit ?? 10))));
    const configured = await ctx.fns.settings.getString({
        module: 'websearch',
        scopeType: 'global',
        key: 'defaultEngine',
        fallback: 'google-browser',
    });
    const engine = (opts.engine ?? configured) as SearchEngine;
    if (engine !== 'brave' && engine !== 'google-browser' && engine !== 'openserp') {
        throw new Error(`websearch.search: unsupported engine ${String(engine)}`);
    }

    const startedAt = performance.now();
    let results: SearchResult[];
    let sourceEngine: 'duckduckgo' | 'bing' | undefined;
    if (engine === 'brave') {
        const response = await ctx.fns.brave.search({ query, count: limit });
        results = response.results.map((item: {
            title: string;
            url: string;
            description: string;
            age?: string | null;
            pageAge?: string | null;
            language?: string | null;
            profile?: string | null;
            extraSnippets?: string[] | null;
        }) => ({
            title: stripTags(item.title),
            url: item.url,
            description: stripTags(item.description),
            descriptionHtml: /<[^>]+>/.test(String(item.description ?? '')) ? item.description : null,
            publishedAt: item.age ?? item.pageAge ?? null,
            language: item.language ?? null,
            site: item.profile ?? null,
            extraSnippets: (item.extraSnippets ?? []).map(stripTags).filter((snippet) => snippet.length > 0),
        }));
    } else if (engine === 'openserp') {
        const endpoint = new URL(await ctx.fns.settings.getString({
            module: 'websearch', scopeType: 'global', key: 'openserpEndpoint', fallback: 'http://127.0.0.1:7000',
        }) ?? 'http://127.0.0.1:7000');
        if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
            throw new Error('websearch.search: openserpEndpoint must be an HTTP(S) base URL without credentials, query or fragment');
        }
        const deadline = performance.now() + 20_000;
        const failures: string[] = [];
        results = [];
        for (const provider of ['duckduckgo', 'bing'] as const) {
            const controller = new AbortController();
            const remaining = Math.min(10_000, Math.max(0, deadline - performance.now()));
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                const url = new URL(`${endpoint.href.replace(/\/$/, '')}/${provider}/search`);
                url.searchParams.set('text', query);
                url.searchParams.set('limit', String(limit));
                const request = async (): Promise<SearchResult[]> => {
                    const response = await fetch(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const data: unknown = await response.json();
                    if (!data || typeof data !== 'object' || !('results' in data) || !Array.isArray(data.results)) {
                        throw new Error('invalid response shape');
                    }
                    const normalized: SearchResult[] = [];
                    const seen = new Set<string>();
                    for (const item of data.results) {
                        if (!item || typeof item !== 'object' || item.type !== 'organic' || item.engine !== provider ||
                            typeof item.title !== 'string' || typeof item.url !== 'string' ||
                            (item.snippet !== undefined && typeof item.snippet !== 'string')) continue;
                        let link: URL;
                        try { link = new URL(item.url); } catch { continue; }
                        if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password) continue;
                        link.hash = '';
                        const title = stripTags(item.title);
                        if (!title || seen.has(link.href)) continue;
                        seen.add(link.href);
                        normalized.push({ title, url: link.href, description: stripTags(item.snippet ?? ''),
                            descriptionHtml: null, publishedAt: null, language: null, site: null, extraSnippets: [] });
                        if (normalized.length >= limit) break;
                    }
                    if (!normalized.length) throw new Error('no usable results');
                    return normalized;
                };
                results = await Promise.race([
                    request(),
                    new Promise<never>((_, reject) => {
                        timer = setTimeout(() => { controller.abort(); reject(new Error('request timed out')); }, remaining);
                    }),
                ]);
                sourceEngine = provider;
                break;
            } catch (error) {
                // Never expose response bodies, query-bearing transport errors or fabricated results.
                const message = error instanceof Error ? error.message : '';
                failures.push(`${provider}: ${/^(HTTP \d{3}|invalid response shape|no usable results|request timed out)$/.test(message) ? message : 'request failed'}`);
            } finally {
                clearTimeout(timer);
                controller.abort();
            }
        }
        if (!results.length) throw new Error(`websearch.search: OpenSERP failed (${failures.join('; ')})`);
    } else {
        const response = await ctx.fns.browser.googleSearch({
            query,
            count: limit,
            session: `websearch-${Date.now()}`,
        });
        results = response.results.map((item: { title: string; url: string; snippet?: string }) => ({
            title: stripTags(item.title),
            url: item.url,
            description: stripTags(item.snippet ?? ''),
            descriptionHtml: null,
            publishedAt: null,
            language: null,
            site: null,
            extraSnippets: [],
        }));
    }

    return {
        query,
        engine,
        ...(sourceEngine ? { sourceEngine } : {}),
        results: results.slice(0, limit),
        durationMs: Math.round(performance.now() - startedAt),
    };
}
