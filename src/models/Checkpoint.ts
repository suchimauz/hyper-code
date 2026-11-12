/** Serializable SDK-native compaction checkpoint. Persist verbatim and replay through a CheckpointEntry; payload is opaque and never prose. */
export type Checkpoint = {
    kind: "native-checkpoint";
    version: 1;
    /** Compatibility identity: replay is accepted only on the same provider, connection and model. */
    provider: string;
    connectionId: string;
    model: string;
    /** Provider-native opaque item. */
    payload: Record<string, unknown>;
};
