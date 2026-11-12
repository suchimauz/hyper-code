/** Bind OAuth credential slots to saved proxies without copying any secrets. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `CREATE TABLE IF NOT EXISTS llm_account_proxies (
            provider TEXT NOT NULL,
            account TEXT NOT NULL,
            proxy_id UUID NOT NULL REFERENCES socks_proxies(id) ON DELETE RESTRICT,
            PRIMARY KEY (provider, account),
            FOREIGN KEY (provider, account) REFERENCES oauth_credentials(provider, account) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS llm_account_proxies_proxy_id ON llm_account_proxies(proxy_id);
        ALTER TABLE oauth_credentials ADD COLUMN IF NOT EXISTS refresh_uncertain BOOLEAN NOT NULL DEFAULT FALSE;`});
    },
};
