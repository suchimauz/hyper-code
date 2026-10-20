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
    expiresAt: number;
    process: Bun.Subprocess<"pipe", "pipe", "pipe"> | null;
};
