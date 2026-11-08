/** Immutable attribution captured before one provider request, never inferred from a later active goal. */
export type UsageBinding = Readonly<{
    provider: string;
    requestId: string;
    sourceAgentId: string;
    runId: string;
    rootAccountingAgentId: string;
    goalIdAtBoundary: string | null;
}>;
