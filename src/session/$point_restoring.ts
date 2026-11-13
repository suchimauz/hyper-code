/** Transactional cleanup barrier: caller holds the archived agent row lock through cleanup and clearing archived_at.
 * Handlers use framework database operations on the ambient transaction, never start nested transactions,
 * and queue external notifications in afterCommit. Failure rolls back cleanup and leaves the owner archived.
 */
export default {
    calledWith: "{ agentId: string; afterCommit: Array<() => Promise<void>> }",
    answerWith: "void — awaited inside the restoring transaction; queued notifications run only after commit",
};
