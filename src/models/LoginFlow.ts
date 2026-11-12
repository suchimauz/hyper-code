/** Process-local provider login flow; only its public fields are ever returned. */
export type LoginFlow = {
    flowId: string;
    status: "pending" | "succeeded" | "failed" | "expired";
    /** Selects the provider's device-code or PKCE authorization-code UI. */
    kind: "device-code" | "authorization-code";
    verificationUri?: string;
    userCode?: string;
    /** Provider authorization page for authorization-code flows. */
    authorizationUrl?: string;
    /** Whether a best-effort local callback listener is running. */
    callbackListening?: boolean;
    /** Unix epoch milliseconds. */
    expiresAt: number;
    /** Safe status message, never containing tokens or codes other than the user code. */
    message?: string;
    abort: AbortController;
    /** Background poll; settles when the flow leaves pending. */
    done?: Promise<void>;
};
