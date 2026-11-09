/** One mounted plugin's runtime-built browser bundle, or the reason it could not be built. */
export type UiBundle = {
    /** Mounted plugin name; the UI extension id must equal it. */
    name: string;
    /** Plugin layer: official plugins are pre-approved, every other layer needs explicit human approval. */
    source: string;
    /** Runtime namespaces owned by the plugin; Canvas kinds must start with one of them. */
    namespaces: string[];
    /** Plugin-relative entry file declared in package.json procs.ui.entry. */
    entry: string;
    /** Fingerprint of the UI sources and manifest block; a change triggers a rebuild. */
    fingerprint: string;
    /** SHA-256 prefix of the built bundle; approval is bound to it. Null when the build failed. */
    hash: string | null;
    /** Built ESM bundle text. Null when the build failed. */
    code: string | null;
    /** Requested grants from package.json procs.ui. */
    grants: types.plugins.UiGrants;
    /** Legacy document path → granted page id, so Applications opens the native page instead of an iframe. */
    applications: Record<string, string>;
    /** package.json procs.icon (Phosphor class), the default icon of the plugin's Canvas launchers; null when absent. */
    icon: string | null;
    /** Build or manifest validation error shown in the plugin status. */
    error: string | null;
    /** Epoch milliseconds of the build. */
    builtAt: number;
};
