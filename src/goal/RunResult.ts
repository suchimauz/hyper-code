/** Explicit bridge result; only committed active checkpoints permit further automatic work. */
export type RunResult =
 | {kind:'disabled'|'excluded'|'absent';allowContinuation:false}
 | {kind:'inactive';goalId:string;allowContinuation:false}
 | {kind:'blocked';reason:string;allowContinuation:false}
 | {kind:'bound';state:types.goal.RunState;allowContinuation:false}
 | {kind:'recorded';allowContinuation:false}
 | {kind:'committed';checkpointId:string;sequence:number;revision:number;budgetTransition:boolean;status:types.goal.State['status'];allowContinuation:boolean};
