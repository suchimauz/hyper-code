/** Add the instance-wide SOCKS5 registry; credentials remain in encrypted local_secrets. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `CREATE TABLE IF NOT EXISTS socks_proxies (
            id UUID PRIMARY KEY,
            name TEXT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
            credential_ref TEXT NULL,
            revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )`});
    },
};
