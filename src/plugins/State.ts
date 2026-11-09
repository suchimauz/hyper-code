// ctx.state.plugins — runtime-built plugin UI bundles, keyed by plugin name.
export type State = {
    /** Plugin name → its latest UI build (bundle, hash, grants or error). */
    ui?: Record<string, types.plugins.UiBundle>;
};
