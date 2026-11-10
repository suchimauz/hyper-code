/** Pure synchronous, side-effect-free codecs for atomic batch members. Never call ordinary prepare/submit hooks. */
export type BatchCodec = {
    version: 1;
    /** Validate the complete public spec and return its canonical JSON representation. Throw only safe errors. */
    normalizeSpec: (opts: { spec: Record<string, unknown> }) => Record<string, unknown>;
    /** Validate draft fields without persistence. Secret results contain references only; values remain private. */
    validate: (opts: { spec: Record<string, unknown>; values: types.input.FormValues }) => types.input.BatchValidation;
    /** Return browser-safe spec metadata. */
    projectSpec: (opts: { spec: Record<string, unknown> }) => Record<string, unknown>;
    /** Return browser-safe draft fields. Secret codecs must return an empty object. */
    projectDraft: (opts: { spec: Record<string, unknown>; values: types.input.FormValues }) => types.input.FormValues;
    /** Optional safe history projection; must never include raw secret values. */
    history?: (opts: { spec: Record<string, unknown>; result: Record<string, unknown> }) => types.input.HistorySummary | null;
};
