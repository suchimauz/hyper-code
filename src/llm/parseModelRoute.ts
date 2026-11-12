/**
 * Split a model route into SSH host, provider, account and model ID and return its canonical form.
 *
 * Single parser for every model identifier. The canonical template is `[ssh/<host>:]<provider>/<account>:<model>` with the account always explicit. Legacy aliases are accepted and normalised: `<provider>:<model>` gets account `default`, a bare model ID becomes `lmstudio/default:<id>`. Use it instead of ad-hoc regexes whenever code needs the provider, account or SSH host of a model, or needs to compare/store a model route. Throws on whitespace, empty input, malformed SSH hosts or SSH routes without an account.
 * @param opts.model Model route in canonical `[ssh/<host>:]<provider>/<account>:<model>` form or a legacy alias: `<provider>:<model>` (account default) or a bare model ID (lmstudio).
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model route in canonical `[ssh/<host>:]<provider>/<account>:<model>` form or a legacy alias: `<provider>:<model>` (account default) or a bare model ID (lmstudio). */
        model: string;
    },
): { host: string | null; provider: string; account: string; model: string; route: string; canonical: boolean } {
    const raw = String(opts.model ?? "").trim();
        if (!raw || /\s/.test(raw)) throw new Error("Invalid model route");
        let host: string | null = null;
        let rest = raw;
        if (raw.startsWith("ssh/")) {
            const ssh = /^ssh\/([A-Za-z0-9][A-Za-z0-9_.-]{0,63}):(.+)$/.exec(raw);
            if (!ssh || ssh[1] === "." || ssh[1] === "..") throw new Error("Invalid model route");
            host = ssh[1]!; rest = ssh[2]!;
        }
        const m = /^([a-z][\w-]*)(?:\/([\w.-]+))?:(.+)$/.exec(rest);
        if (!m && rest.includes(":")) throw new Error("Invalid model route");
    if (host && !m?.[2]) throw new Error("Invalid model route: SSH routes need an explicit account");
        const provider = m ? m[1]! : "lmstudio";
        const account = m?.[2] ?? "default";
        const model = m ? m[3]! : rest;
        if (account === "." || account === "..") throw new Error("Invalid model route");
        const route = (host ? "ssh/" + host + ":" : "") + provider + "/" + account + ":" + model;
        return { host, provider, account, model, route, canonical: route === raw };
}
