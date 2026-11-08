/** Immutable, run-scoped accounting capability. Never authorizes scheduling or model work. */
export type DelegationAuthority = Readonly<{
    capabilityId: string;
    rootAgentId: string;
    goalId: string;
    sourceAgentId: string;
    sourceRunId: string;
    /** Immutable own-user task frontier; required for worker-issued descendant requests. */
    authorizedThroughIdx?: number;
    allowContinuation: false;
}>;
