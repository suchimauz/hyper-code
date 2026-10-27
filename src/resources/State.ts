/** Shared on-demand cache; no timers or retained process handles. */
export type State = {
    cached?: types.resources.Snapshot;
    pending?: Promise<types.resources.Snapshot>;
    previous?: { total: number; idle: number; processes: Record<string, { start: number; ticks: number }> };
};
