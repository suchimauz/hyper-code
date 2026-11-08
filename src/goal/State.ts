/** Persisted Codex-compatible goal snapshot; timestamps are Unix milliseconds. */
export type State = {
    agentId: string; goalId: string; schemaVersion: 1; revision: number;
    objective: string;
    status: "active" | "paused" | "blocked" | "usage_limited" | "budget_limited" | "complete";
    tokenBudget: number | null; tokensUsed: number; timeUsedSeconds: number;
    createdAt: number; updatedAt: number;
};
