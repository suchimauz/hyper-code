/** Distinct model and external mutations; omitted budget preserves it, null removes it. */
export type Command =
    | { kind: "create"; objective: string; tokenBudget?: number | null }
    | { kind: "update"; status: "complete" | "blocked" | "paused" }
    | { kind: "set"; objective?: string; status?: types.goal.State["status"]; tokenBudget?: number | null }
    | { kind: "clear" };
