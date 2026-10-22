export default {
    type: 'number',
    default: 16384,
    min: 2048,
    max: 131072,
    title: 'MiniMax max output tokens',
    description: 'Maximum tokens a MiniMax M Plan response may generate. Thinking tokens count against this budget, so a small value is spent entirely on reasoning and the visible answer comes back empty. Raise it when using a high reasoning effort.',
};
