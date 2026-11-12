/** Safe connection health result; disabled is produced by core without calling the provider. */
export type TestResult = {
    status: "available" | "unavailable" | "configured" | "disabled";
    /** Machine-readable reason such as models-ok or generation-failed. */
    reason: string;
    /** Short human-readable explanation containing no secret values or refs. */
    message: string;
    /** Unix epoch milliseconds when the check completed. */
    checkedAt: number;
};
