/**
 * Turn a provider error or message into a short text without secret values
 *
 * Use before returning any provider-originated message to clients. Removes the connection's own secret values when given, secret:// references, bearer tokens and common API-key shapes, collapses whitespace and truncates to 300 characters.
 * @param opts.message Error, string or unknown thrown value.
 * @param opts.secrets Plain secret values of the connection that must never appear.
 * @param opts.fallback Text used when nothing safe remains. @default "Request failed"
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Error, string or unknown thrown value. */
        message: unknown;
        /** Plain secret values of the connection that must never appear. */
        secrets?: string[];
        /** Text used when nothing safe remains. @default "Request failed" */
        fallback?: string;
    },
): string {
    const raw = opts.message instanceof Error ? opts.message.message : typeof opts.message === "string" ? opts.message : "";
    let text = raw;
    for (const secret of opts.secrets ?? []) if (secret && secret.length >= 4) text = text.split(secret).join("[redacted]");
    text = text
        .replace(/secret:\/\/[^\s"'<>]+/g, "[redacted]")
        .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]")
        .replace(/\b(sk|pk|rk|xai|gsk|key)[-_][A-Za-z0-9_-]{12,}/g, "[redacted]")
        .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
        .replace(/([?&](?:key|api_key|apikey|token|access_token)=)[^&\s]+/gi, "$1[redacted]")
        .replace(/\s+/g, " ").trim();
    if (text.length > 300) text = text.slice(0, 297) + "...";
    return text || opts.fallback || "Request failed";
}
