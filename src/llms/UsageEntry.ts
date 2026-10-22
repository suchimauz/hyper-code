/** Safe subscription quota data shared by desktop and mobile usage indicators. */
export type UsageEntry = {
    /** Safe monthly member budget amounts in USD; never workspace balance or subscription quota. */
    memberBudget?: { available: boolean; spentUsd?: number; limitUsd?: number | null; resetsAt?: number };
    /** Human-readable monetary budget, shared by desktop and mobile surfaces. */
    memberBudgetText?: string;
    /** Provider identifier. */
    provider: string;
    /** Credential account identifier. */
    account: string;
    /** Human-readable credential label. */
    label: string;
    /** Provider/account model prefix. */
    model: string;
    /** Visible catalogue model IDs for this credential. */
    models: string[];
    /** Measured short and long quota windows; omitted when no snapshot exists. */
    windows?: types.llm.UsageSnapshot["windows"];
    /** Remote node name; omitted for local credentials. */
    node?: string;
    /** Measured quota percentage, or null when unknown. */
    usedPercent: number | null;
    /** Quota reset timestamp in milliseconds, if known. */
    resetsAt: number | null;
    /** Subscription plan name, if known. */
    planType: string | null;
    /** Number of agents waiting on this credential. */
    parkedAgents: number;
    /** Display severity of the measured quota. */
    tone: "neutral" | "warning" | "critical" | "error";
    /**
     * The warning, critical and alert percentages this tone was computed from,
     * so every surface colours the same account identically.
     */
    thresholds?: { warnAt: number; criticalAt: number; alertAt: number };
    /** Snapshot timestamp in milliseconds, or zero if absent. */
    updatedAt: number;
    /** Explicit account availability; false may mean exhausted quota or reconnect required, not network failure. */
    available?: boolean;
    /** Whether credential authentication explicitly requires reconnecting. */
    needsReconnect?: boolean;
    /** Quota freshness status; unavailable also marks connected accounts without snapshots. */
    quotaStatus?: "stale" | "unavailable";
};
