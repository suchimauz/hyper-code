/** Raw Linux procfs fixture or live read; null denotes unreadable, never zero. */
export type Reading = {
    sampledAt: number; host: string; cpuCount: number; rootPid: number;
    totalMemory: number; freeMemory: number;
    stat: string | null; meminfo: string | null; enumerationComplete: boolean;
    processes: Array<{ pid: number; stat: string | null; status: string | null; smaps: string | null }>;
};
