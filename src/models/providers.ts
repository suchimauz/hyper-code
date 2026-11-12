/**
 * List registered model providers as a secret-free metadata catalogue
 *
 * Use this catalogue to build provider pickers and configuration forms. Projects only declared metadata, field schemas, transports and action labels; never returns handlers, ownership internals, connection values or secret defaults.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): types.models.ProviderView[] {
    const entries = Object.values(ctx.state.models?.providers ?? {});
    return entries.map(({ definition: def }) => ({
        id: def.id,
        label: def.label,
        ...(def.description !== undefined ? { description: def.description } : {}),
        ...(def.icon !== undefined ? { icon: def.icon } : {}),
        fields: def.fields.map(field => {
            const base = {
                key: field.key, label: field.label,
                ...(field.required !== undefined ? { required: field.required } : {}),
                ...(field.help !== undefined ? { help: field.help } : {}),
                ...(field.placeholder !== undefined ? { placeholder: field.placeholder } : {}),
            };
            switch (field.type) {
                case "secret": return { ...base, type: "secret" as const };
                case "select": return { ...base, type: "select" as const, ...(field.default !== undefined ? { default: field.default } : {}), options: field.options.map(o => ({ value: o.value, label: o.label })) };
                case "number": return { ...base, type: "number" as const, ...(field.default !== undefined ? { default: field.default } : {}) };
                case "boolean": return { ...base, type: "boolean" as const, ...(field.default !== undefined ? { default: field.default } : {}) };
                default: return { ...base, type: field.type, ...(field.default !== undefined ? { default: field.default } : {}) };
            }
        }),
        transports: [...def.transports],
        actions: Object.entries(def.actions ?? {}).map(([name, action]) => ({ name, label: action.label })),
    })).sort((a, b) => a.id.localeCompare(b.id));
}
