// Where the ring turns orange — the "act now" step between yellow and red.
// It fires no toast of its own; the toast belongs to the alert threshold.
export default {
    type: "number" as const,
    default: 60,
    env: "LLM_USAGE_CRITICAL_PERCENT",
    label: "Quota critical threshold, %",
    description: "Percentage of a subscription window at which the quota ring turns orange, before the red alert threshold.",
};
