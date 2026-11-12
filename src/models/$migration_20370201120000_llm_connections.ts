/** Add model connections storage; secret field values live in encrypted local_secrets under namespace models. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `CREATE TABLE IF NOT EXISTS llm_connections (
            id UUID PRIMARY KEY,
            provider TEXT NOT NULL,
            account_name TEXT NOT NULL CHECK (length(btrim(account_name)) BETWEEN 1 AND 100),
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            secrets JSONB NOT NULL DEFAULT '{}'::jsonb,
            transport JSONB NOT NULL DEFAULT '{"kind":"direct"}'::jsonb,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS llm_connections_provider_idx ON llm_connections (provider, created_at)`});
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `DELETE FROM local_secrets WHERE namespace = 'models' AND name ~ '^[0-9a-f-]{36}\\.';
        DROP TABLE IF EXISTS llm_connections`});
    },
};
