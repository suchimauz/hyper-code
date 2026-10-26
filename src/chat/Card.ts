// A card of the chat panel — what a `$chatcard_<name>.ts` file default-exports. The panel opens from the ⋯
// button at the right end of the chat header: a single-column management panel for one chat.
//
// The framework owns the panel: its sections, disclosures, titles, order and what is hidden (setting
// chat.layout). The card owns what is inside. Render runs when the panel opens, with a 1.5 s timeout;
// a throw, a timeout or null only leaves this card out. The "danger" card of the core is always last.
export type Card = {
    /** Card title. */
    title: string;
    /** Phosphor icon class for the title, for example `ph-palette`. */
    icon?: string;
    /** Position in the panel, lower first; ties are broken by id. @default 100 */
    order?: number;
    /** Legacy width hint, accepted for plugin compatibility; the management panel is single-column. @default "S" */
    size?: "S" | "L";
    /** Draws the card: rows drawn by the framework, trusted HTML, or both; null leaves the card out. */
    render: (ctx: Context, session: Session | null, context: types.chat.RenderContext) =>
        types.chat.CardRow[] | { html?: string; rows?: types.chat.CardRow[] } | string | null |
        Promise<types.chat.CardRow[] | { html?: string; rows?: types.chat.CardRow[] } | string | null>;
};
