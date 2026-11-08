/** Immutable committed cumulative source snapshot and process-local clock baseline. */
export type AccountingSnapshot = {
    /** Immutable capability used for this ledger delivery, absent for root. */
    authority?: types.goal.DelegationAuthority;
    /** Absent on legacy exact receipts. */
    quality?: types.goal.UsageAccumulator['quality'];
    /** Durable provenance: missing fields are null, never reported as zero. */
    usageEvidence?: Readonly<Record<string,types.goal.UsageNormalized>>;
    current: {
        input: string;
        cached: string;
        output: string;
    };
    sequence: number;
    clockEpoch: string;
    nowMs: number;
    baselineMs: number;
};
