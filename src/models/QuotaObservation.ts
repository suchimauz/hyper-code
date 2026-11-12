/** Quota windows observed on an inference response; separate from token usage. */
export type QuotaObservation = {
    windows: {
        /** primary, secondary or tertiary provider window. */
        name: string;
        /** Percentage from 0 to 100. */
        usedPercent: number;
        windowMinutes?: number;
        /** Unix epoch milliseconds. */
        resetAt?: number;
    }[];
    source: "headers" | "stream";
};
