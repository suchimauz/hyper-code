/** Standard usage snapshot, or status-only fallback from a cached connection test. */
export type UsageReport = {
    status: types.models.TestResult["status"];
    reason?: string;
    /** Unix epoch milliseconds. */
    checkedAt: number;
    windows?: {
        label: string;
        /** Percentage from 0 to 100. */
        usedPercent?: number;
        remaining?: number;
        /** Unix epoch milliseconds, when known. */
        resetAt?: number;
    }[];
    balance?: { amount: number; currency: string };
};
