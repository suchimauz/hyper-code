/** Configuration schema consumed by connection validation and schema-driven forms. */
export type FieldSpec = {
    /** Stable configuration key, unique within the provider. */
    key: string;
    /** Human-readable field name. */
    label: string;
    /** Whether a value must be supplied before saving a connection. */
    required?: boolean;
    /** Safe explanatory text; never include credentials. */
    help?: string;
    /** Safe example displayed when the field is empty. */
    placeholder?: string;
} & (
    | { type: "text" | "url"; default?: string }
    | { type: "select"; default?: string; options: { value: string; label: string }[] }
    | { type: "secret"; default?: never }
    | { type: "number"; default?: number }
    | { type: "boolean"; default?: boolean }
);
