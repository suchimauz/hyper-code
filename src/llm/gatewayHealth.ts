/**
 * Checks Asoft LLM Gate API availability with a cached read-only models request
 *
 * Use for connection lists and gateway model discovery. A successful models response only confirms API catalogue access, never generation success or quota. Disabled and missing-key configurations do not make network requests. Responses are bounded, redirects refused, and errors contain no endpoint or credentials.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{ configured: boolean; status: "configured" | "available" | "unavailable" | "unknown"; reason: "disabled" | "missing-key" | "invalid-url" | "models-ok" | "http-error" | "invalid-response" | "timeout-or-network"; checkedAt: number | null; models: string[] }> {
    type Health = { configured: boolean; status: "configured" | "available" | "unavailable" | "unknown"; reason: "disabled" | "missing-key" | "invalid-url" | "models-ok" | "http-error" | "invalid-response" | "timeout-or-network"; checkedAt: number | null; models: string[] };
    let endpoint: Awaited<ReturnType<typeof ctx.fns.llm.resolveEndpoint>>;
    try { endpoint = await ctx.fns.llm.resolveEndpoint({ model: "oneapi:catalog" }); }
    catch { return { configured: false, status: "unknown", reason: "disabled", checkedAt: null, models: [] }; }
    if (!endpoint.apiKey) return { configured: false, status: "configured", reason: "missing-key", checkedAt: null, models: [] };
    let url: URL;
    try {
     url = new URL(endpoint.url);
     if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/chat/completions")) throw new Error("invalid");
     url.pathname = url.pathname.replace(/\/chat\/completions$/, "/models");
    } catch { return { configured: false, status: "unknown", reason: "invalid-url", checkedAt: null, models: [] }; }
    const state = (ctx.state ?? {}) as typeof ctx.state & { llmGatewayHealth?: { key: string; at: number; value?: Health; pending?: Promise<Health> } };
    const key = String(Bun.hash(url.href + "\0" + endpoint.apiKey));
    let cache = state.llmGatewayHealth;
    if (!cache || cache.key !== key) cache = state.llmGatewayHealth = { key, at: 0 };
    if (cache.value && Date.now() - cache.at < 60_000) return cache.value;
    if (cache.pending) return cache.pending;
    const probe = async (): Promise<Health> => {
     const base = { configured: true, checkedAt: Date.now(), models: [] as string[] };
     try {
      const res = await fetch(url.href, { headers: { authorization: "Bearer " + endpoint.apiKey }, redirect: "manual", signal: AbortSignal.timeout(2000) });
      if (!res.ok) { await res.body?.cancel(); return { ...base, status: "unavailable", reason: "http-error" }; }
      const reader = res.body?.getReader();
      if (!reader) return { ...base, status: "unknown", reason: "invalid-response" };
      const chunks: Uint8Array[] = []; let bytes = 0;
      try { while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 262144) { await reader.cancel(); return { ...base, status: "unknown", reason: "invalid-response" }; } chunks.push(next.value); } }
      finally { reader.releaseLock(); }
      const all = new Uint8Array(bytes); let at = 0; for (const chunk of chunks) { all.set(chunk, at); at += chunk.length; }
      let body: { data?: { id?: string }[] }; try { body = JSON.parse(new TextDecoder().decode(all)); } catch { return { ...base, status: "unknown", reason: "invalid-response" }; }
      if (!Array.isArray(body?.data)) return { ...base, status: "unknown", reason: "invalid-response" };
      const models = [...new Set(body.data.filter(m => m && typeof m.id === "string" && m.id.length > 0 && m.id.length <= 256).map(m => m.id!))].slice(0, 2000);
      return { ...base, status: "available", reason: "models-ok", models };
     } catch { return { ...base, status: "unavailable", reason: "timeout-or-network" }; }
    };
    const current = cache;
    current.pending = probe().then(value => { current.value = value; current.at = Date.now(); return value; }).finally(() => { current.pending = undefined; });
    return current.pending;
}
