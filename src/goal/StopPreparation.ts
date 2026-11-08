/** Immutable Stop accounting handoff; created before acquiring the owner transaction lock. */
export type StopPreparation =
 | {kind:'absent'}
 | {kind:'blocked';authority?:types.goal.DelegationAuthority;goalId:string;reason:string;state:types.goal.RunState}
 | {kind:'ready';authority?:types.goal.DelegationAuthority;goalId:string;state:types.goal.RunState;snapshot:Readonly<{
 authority?:types.goal.DelegationAuthority;agentId:string;goalId:string;expectedRevision:number;runToken:string;sourceAgentId:string;runId:string;checkpointId:string;sequence:number;clockEpoch:string;current:Readonly<{input:string;cached:string;output:string}>;quality:types.goal.UsageAccumulator['quality'];usageEvidence:Readonly<Record<string,types.goal.UsageNormalized>>;boundaryGoalId:string;boundaryRootAgentId:string;nowMs:number;initialNowMs:number;initialBaseline:Readonly<{input:string;cached:string;output:string}>;
 }>};
