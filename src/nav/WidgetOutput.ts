// Native widget data. HTML and executable actions are not supported.
export type WidgetOutput = {
    /** Plain-text destination rows rendered and escaped by the native host. */
    items?: types.nav.Item[];
    /** Lay sections out side by side in columns (wide tiles). @default false */
    columns?: boolean;
    /** Titled groups; collapsed puts the group in a closed disclosure. */
    sections?: Array<{ title: string; items?: types.nav.Item[]; tone?: "primary" | "warning"; collapsed?: boolean; count?: number }>;
};
