// Where the quota ring leaves green. Below this the quota is not a factor in
// any decision; above it, "should I switch model before starting something
// long?" becomes a real question. The default sits early on purpose: a plan
// that is a third spent should already look worth thinking about.
export default {
    type: "number" as const,
    default: 30,
    env: "LLM_USAGE_WARN_PERCENT",
    label: "Quota warning threshold, %",
    description: "Percentage of a subscription window at which the quota ring turns yellow.",
};
