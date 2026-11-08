/** Immutable committed cumulative source snapshot and process-local clock baseline. */
export type AccountingSnapshot = {
    /** Immutable capability used for this ledger delivery, absent for root. */
    authority?: types.goal.DelegationAuthority;
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
