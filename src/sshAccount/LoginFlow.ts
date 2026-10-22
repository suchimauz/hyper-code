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
    expiresAt: number;
    process: Bun.Subprocess<"pipe", "pipe", "pipe"> | null;
};
