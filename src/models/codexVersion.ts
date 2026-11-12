/**
 * Choose the Codex client version sent to the backend
 *
 * Returns the connection's validated clientVersion override, otherwise the documented SDK default (0.157.1, the floor that exposes the GPT-6 catalogue). Never runs the codex CLI, a shell or reads account files. Use for every Codex models and responses request.
 * @param opts.config Non-secret Codex connection configuration.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Non-secret Codex connection configuration. */
        config: types.models.ResolvedConnection["config"];
    },
): string {
    const v = typeof opts.config.clientVersion === "string" ? opts.config.clientVersion.trim() : "";
    if (v && /^[0-9A-Za-z.+-]{1,40}$/.test(v)) return v;
    return "0.157.1";
}
