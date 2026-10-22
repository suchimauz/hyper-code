/** Official OpenCode Go comparison figures, not live remaining quota or a pay-as-you-go invoice. Missing values mean unpublished or unavailable. */
export type ModelPrice = {
    billing: 'api' | 'subscription' | 'unknown';
    go?: { requests5h: number | 'unlimited'; monthlyUsd: number | 'unlimited' };
    plus?: { requests5h: number | 'unlimited'; monthlyUsd: number | 'unlimited' };
    /** Ascending request allowance order of the full official comparison table. */
    order?: number;
    source?: string;
    updatedAt?: number;
    note?: string;
};
