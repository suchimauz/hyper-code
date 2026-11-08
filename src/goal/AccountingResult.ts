/** Atomic checkpoint outcome. Duplicate retries never emit a second budget transition. */
export type AccountingResult = {
    duplicate: boolean;
    revision: number;
    status: types.goal.State["status"];
    tokensUsed: number;
    timeUsedSeconds: number;
    increment: string;
    elapsedSeconds: number;
    budgetTransition: boolean;
};
