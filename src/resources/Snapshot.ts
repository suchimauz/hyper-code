/** Machine and local Hyper process-tree resource sample; bytes and machine-normalized percentages. */
export type Snapshot = {
    sampledAt: number; host: string; platform: string; cpuCount: number;
    cpu: { machine: number | null; hyper: number | null };
    memory: { total: number; used: number; hyper: number | null };
    swap: { total: number | null; used: number | null; hyper: number | null };
    processCount: number;
    groups: Array<{ name: string; count: number; cpu: number | null; memory: number | null; swap: number | null }>;
    memoryBasis: 'PSS' | 'RSS' | 'unavailable'; supported: boolean; note: string | null;
};
