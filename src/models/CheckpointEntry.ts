/** Ordered stream/compact input entry placing a native checkpoint at its position among messages. */
export type CheckpointEntry = { type: "checkpoint"; checkpoint: types.models.Checkpoint };
