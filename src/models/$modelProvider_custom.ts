/** Built-in custom HTTP provider; all network access uses the resolved connection transport. */
export default {
    id: "custom",
    label: "Custom",
    description: "Connect an OpenAI, Anthropic or Gemini compatible API endpoint.",
    fields: [
        { key: "baseUrl", label: "API base URL", type: "url", required: true },
        { key: "apiKey", label: "API key", type: "secret" },
        { key: "protocol", label: "Protocol", type: "select", required: true, default: "openai-chat", options: [
            { value: "openai-chat", label: "OpenAI Chat Completions" },
            { value: "openai-responses", label: "OpenAI Responses" },
            { value: "anthropic", label: "Anthropic Messages" },
            { value: "gemini", label: "Gemini" },
        ] },
        { key: "testModel", label: "Test model", type: "text", help: "Optional model for a minimal generation test, which may incur a charge. Manual model ids are configured through the shared models list." },
    ],
    transports: ["direct", "socks", "ssh-tunnel"],
    validate(_ctx, config) {
        let url: URL;
        try { url = new URL(String(config.baseUrl)); }
        catch { throw new Error("API base URL must be an absolute HTTP(S) URL"); }
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || String(config.baseUrl).includes("?") || String(config.baseUrl).includes("#")) {
            throw new Error("API base URL must be HTTP(S), without credentials, query or fragment");
        }
    },
    async test(ctx, conn) {
        try { await ctx.fns.models.customProtocol({ conn, operation: "models" }); }
        catch { return { status: "unavailable", reason: "models-failed", message: "Model discovery request failed", checkedAt: Date.now() }; }
        if (typeof conn.config.testModel === "string" && conn.config.testModel.trim()) {
            try { await ctx.fns.models.customProtocol({ conn, operation: "generation" }); }
            catch { return { status: "unavailable", reason: "generation-failed", message: "Minimal generation request failed", checkedAt: Date.now() }; }
            return { status: "available", reason: "generation-ok", message: "Model discovery and generation succeeded", checkedAt: Date.now() };
        }
        return { status: "available", reason: "models-ok", message: "Model discovery succeeded; generation was not requested", checkedAt: Date.now() };
    },
    async listModels(ctx, conn) {
        // Let core listModels supply the manual fallback and safe discovery error flag.
        const discovered = await ctx.fns.models.customProtocol({ conn, operation: "models" });
        const ids = new Set(discovered.map(model => model.id));
        for (const id of Array.isArray(conn.config.models) ? conn.config.models : []) {
            if (id && !ids.has(id)) { ids.add(id); discovered.push({ id }); }
        }
        return discovered;
    },
    // No usage callback: the core returns only test status, reason and checkedAt.
} satisfies types.models.ProviderDefinition;
