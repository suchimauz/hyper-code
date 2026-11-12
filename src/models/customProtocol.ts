/**
 * Request custom endpoint model discovery or a minimal generation using its configured wire protocol
 *
 * Use from the custom model provider with a resolved connection. Routes every request through conn.fetch, reads only its apiKey secret, applies protocol-specific authentication and version paths, and rejects failed HTTP requests or malformed model catalogues without exposing response bodies.
 * @param opts.conn Resolved custom connection with baseUrl, protocol, optional testModel and transport-bound fetch.
 * @param opts.operation Discover models or send one minimal generation using config.testModel.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved custom connection with baseUrl, protocol, optional testModel and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
        /** Discover models or send one minimal generation using config.testModel. */
        operation: "models" | "generation";
    },
): Promise<types.models.ModelInfo[]> {
    const { conn, operation } = opts;
    const protocol = conn.config.protocol;
    if (!["openai-chat", "openai-responses", "anthropic", "gemini"].includes(String(protocol))) throw new Error("Unsupported custom protocol");
    const url = new URL(String(conn.config.baseUrl));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || String(conn.config.baseUrl).includes("?") || String(conn.config.baseUrl).includes("#")) throw new Error("Invalid custom base URL");
    let base = url.href.replace(/\/+$/, "");
    if (protocol === "anthropic" && !base.endsWith("/v1")) base += "/v1";
    if (protocol === "gemini" && !/\/v1(?:beta)?$/.test(base)) base += "/v1beta";
    const headers = new Headers({ Accept: "application/json" });
    const key = await conn.secret("apiKey");
    if (protocol === "anthropic") { headers.set("anthropic-version", "2023-06-01"); if (key) headers.set("x-api-key", key); }
    else if (key) headers.set(protocol === "gemini" ? "x-goog-api-key" : "Authorization", protocol === "gemini" ? key : "Bearer " + key);
    let path = "/models";
    let body: string | undefined;
    if (operation === "generation") {
     const model = conn.config.testModel;
     if (typeof model !== "string" || !model.trim()) throw new Error("A test model is required");
     headers.set("Content-Type", "application/json");
     if (protocol === "openai-chat") { path = "/chat/completions"; body = JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }], max_tokens: 1, stream: false }); }
     else if (protocol === "openai-responses") { path = "/responses"; body = JSON.stringify({ model, input: "Hi", max_output_tokens: 1, stream: false }); }
     else if (protocol === "anthropic") { path = "/messages"; body = JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }], max_tokens: 1, stream: false }); }
     else { path = "/models/" + encodeURIComponent(model.replace(/^models\//, "")) + ":generateContent"; body = JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Hi" }] }], generationConfig: { maxOutputTokens: 1 } }); }
    }
    const response = await conn.fetch(base + path, { method: body ? "POST" : "GET", headers, ...(body ? { body } : {}) });
    if (!response.ok) { await response.body?.cancel(); throw new Error("Custom " + operation + " request failed (HTTP " + response.status + ")"); }
    if (operation === "generation") { await response.body?.cancel(); return []; }
    const payload = await response.json() as { data?: { id?: string }[]; models?: { name?: string; displayName?: string }[] };
    const rows = protocol === "gemini" ? payload.models : payload.data;
    if (!Array.isArray(rows)) throw new Error("Invalid custom model catalogue");
    const models: types.models.ModelInfo[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
     const id = protocol === "gemini" ? (row as { name?: string })?.name?.replace(/^models\//, "") : (row as { id?: string })?.id;
     if (typeof id !== "string" || !id || seen.has(id)) continue;
     seen.add(id); models.push({ id });
    }
    return models;
}
