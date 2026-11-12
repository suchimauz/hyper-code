/** Process-local device-code login flow; only the public fields are ever returned. */
export type LoginFlow = {
    flowId: string;
    status: "pending" | "succeeded" | "failed" | "expired";
    verificationUri: string;
    userCode: string;
    /** Unix epoch milliseconds. */
    expiresAt: number;
    /** Safe status message, never containing tokens or codes other than the user code. */
    message?: string;
    abort: AbortController;
    /** Background poll; settles when the flow leaves pending. */
    done?: Promise<void>;
};
