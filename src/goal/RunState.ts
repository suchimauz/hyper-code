/** Ephemeral run-scoped accounting binding. Never persist in scratchpad or clone into a fork. */
export type RunState = {
    readonly binding: Readonly<{authority?:types.goal.DelegationAuthority;rootAgentId:string;sourceAgentId:string;goalId:string;objective:string;runId:string;runToken:string;clockEpoch:string;initialNowMs:number}>;
    sealed:boolean;
    pendingRequests:Set<string>;
    revision:number;
    sequence:number;
    usage?:types.goal.UsageAccumulator;
    blocked?:string;
    tail:Promise<void>;
};
