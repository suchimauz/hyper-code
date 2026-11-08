/** Durable per-session advisory collaboration state; never an OS sandbox. */
export type State = {
    version: 1;
    agentId: string;
    mode: 'plan' | 'execute';
    revision: number;
    scope: 'session';
    advisory: true;
    runningPolicy: 'reject';
    pending: null;
    proposal: null | { id: string; inputId: string; plan: string; status: 'pending' | 'approved' | 'kept'; createdAt: number };
};
