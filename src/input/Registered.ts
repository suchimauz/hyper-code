/** A registered kind: the module's definition plus where it came from. */
export type Registered = types.input.Kind & {
    name: string;
    /** Mounted source identity, never the declaration's freely chosen module path. Optional for pre-upgrade registrations. */
    owner?: string;
    module: string;
    rel: string;
    hint?: string;
};
