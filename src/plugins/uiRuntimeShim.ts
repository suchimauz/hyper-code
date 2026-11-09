/**
 * Generates a browser ES module that re-exports a host-owned runtime library to plugin bundles
 *
 * Use to serve /plugins/ui/runtime/<module>.js. Plugin UI bundles import react, react/jsx-runtime, react-dom and the Hyper UI SDK from these shims; each shim reads the single instance the React shell placed on globalThis.__HYPER_UI_RUNTIME__ so plugins share one React and one SDK. Returns null for unknown module names.
 * @param opts.module Shim module name: react, react-jsx-runtime, react-dom or hyper-ui.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Shim module name: react, react-jsx-runtime, react-dom or hyper-ui. */
        module: string;
    },
): Promise<string | null> {
    let names: string[];
    if (opts.module === 'react') names = Object.keys(await import('react'));
    else if (opts.module === 'react-jsx-runtime') names = Object.keys(await import('react/jsx-runtime'));
    else if (opts.module === 'react-dom') names = Object.keys(await import('react-dom'));
    else if (opts.module === 'hyper-ui') {
        const root = ctx.fns.procs.project.projectRoot({});
        names = new Bun.Transpiler({ loader: 'ts' }).scan(await Bun.file(`${root}/frontend/src/sdk/index.ts`).text()).exports;
    } else return null;
    const exported = [...new Set(names)].filter(n => /^[A-Za-z_$][\w$]*$/.test(n) && n !== 'default');
    return `const host = globalThis.__HYPER_UI_RUNTIME__;\nif (!host || !host[${JSON.stringify(opts.module)}]) throw new Error('Hyper UI runtime is not initialised');\nconst m = host[${JSON.stringify(opts.module)}];\nexport default (m.default ?? m);\n${exported.map(n => `export const ${n} = m[${JSON.stringify(n)}];`).join('\n')}\n`;
}
