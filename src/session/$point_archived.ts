/** A successful first archive transition; failures are logged without undoing archival. */
export default {
    calledWith: "{ agentId: string }",
    answerWith: "void — awaited after archival; rejection is logged and does not fail archive",
};
