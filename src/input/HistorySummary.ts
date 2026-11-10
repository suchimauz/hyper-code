/** Display-safe chat-history projection of a terminal plugin input. */
export type HistorySummary = {
    /** One short line shown in the collapsed history row. */
    summary: string;
    /** Optional label/value pairs shown when the row is expanded. */
    details?: { label: string; value: string }[];
};
