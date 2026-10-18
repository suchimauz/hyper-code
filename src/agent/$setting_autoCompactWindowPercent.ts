export default {
    type: "number",
    default: 65,
    min: 30,
    max: 95,
    title: "Auto-compaction at % of model window",
    description: "Compact automatically at completed tool-batch boundaries and after successful runs once context exceeds this percentage of the model window. The default 65% leaves room for tool output and the summary request. The lower of this and autoCompactTokens wins.",
};
