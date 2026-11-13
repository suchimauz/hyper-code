/** Process-local archive cleanup timer; preserved across namespace reloads. */
export type State = {
    /** Hourly cleanup handle, absent before startup and after stop. */
    archivedSweepTimer?: ReturnType<typeof setInterval>;
};
