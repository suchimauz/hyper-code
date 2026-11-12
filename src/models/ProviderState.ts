/** Opaque provider continuation state bound to one provider, connection, session and logical run. Caller-owned: carry it between requests of the same run and drop it when the run ends. Private operational data — do not log or show it. */
export type ProviderState = {
    provider: string;
    connectionId: string;
    sessionId: string;
    runId: string;
    /** Provider-private string values; opaque to callers. */
    data: Record<string, string>;
};
