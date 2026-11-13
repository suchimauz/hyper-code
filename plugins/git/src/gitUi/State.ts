/** Process-local archive cleanup timer; preserved across namespace reloads. */
export type State = {
    /** Hourly cleanup handle, absent before startup and after stop. */
    archivedSweepTimer?: ReturnType<typeof setInterval>;
    /** Shared repository subscriptions, retained across hot reload and closed on plugin stop. */
    watchers?: Map<string, { key: string; state: 'watching' | 'polling' | 'error'; error?: string; ready: Promise<void>; touch: () => void; close: () => void }>;
};
