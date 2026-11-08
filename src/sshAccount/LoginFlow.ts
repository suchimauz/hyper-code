/** In-memory remote authorization process; contains only bounded public login hints. Never persist this object. */
export type LoginFlow = {
    id: string;
    instance: string;
    provider: "codex" | "claude-code";
    account: string;
    status: "pending" | "connected" | "failed" | "cancelled";
    verificationUri: string | null;
    userCode: string | null;
    error: string | null;
    /** Optional for flows started before diagnostics were installed. No provider output. */
    diagnostics?: {
        startedAt: number;
        endedAt: number | null;
        exitCode: number | null;
        reason: 'network' | 'tls' | 'permission' | 'http' | 'missing-credentials' | 'cli-exit' | 'timeout' | 'interrupted' | null;
        httpCode: number | null;
        stages: { phase: 'ssh-preflight' | 'cli-login' | 'credential-check' | 'login-status'; startedAt: number; endedAt: number | null; exitCode: number | null }[];
    };
    /** Original pinned SSH invocation; never re-resolve a changed instance during callback delivery. */
    callbackConnection?: {bin:string;args:string[];host:string};
    /** Secret-free replay guard. Uncertain delivery requires a new login, not resubmission. */
    callbackSubmission?: 'sending' | 'sent' | 'uncertain';
    expiresAt: number;
    process: Bun.Subprocess<"pipe", "pipe", "pipe"> | null;
};
