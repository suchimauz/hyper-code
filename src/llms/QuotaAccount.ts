/** Public credential-free quota or availability record for the unified quota API. */
export type QuotaAccount = {
    id: string;
    provider: string;
    account: string;
    label: string;
    /** Provider/account prefix for logo selection, not a transport route. */
    model: string;
    connection: "local" | "mauzcode" | "ssh";
    host?: string;
    kind: "quota" | "status";
    windows?: Partial<Record<"fiveHour" | "weekly" | "monthly", {
        usedPercent: number | null;
        resetsAt: number | null;
        tone: "neutral" | "warning" | "critical" | "error";
    }>>;
    status?: "available" | "unavailable" | "disabled" | "unknown";
    quotaStatus?: "fresh" | "stale" | "unavailable";
    /** Actual successful quota snapshot time in epoch milliseconds; null when never observed. Rereads do not refresh this timestamp. */
    quotaUpdatedAt?: number | null;
    tone: "neutral" | "warning" | "critical" | "error";
    planType?: string | null;
    needsReconnect?: boolean;
    parkedAgents: number;
};
