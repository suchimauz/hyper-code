import { dirname, join } from "node:path";
import { mkdir, rename, rm, realpath } from "node:fs/promises";

/** Creates a documented runtime function with type checking; use activate:false to author offline without loading, generating declarations, or indexing it. */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Source root: src, .mauzcode, plugin:<mounted-name> (official/user), or plugins/<name>/src (official). @default src */
        root?: string;
        /** Slash-separated module path, such as `gmail` or `runtime/docs`. */
        module: string;
        /** Function file and runtime name in lower camelCase. */
        name: string;
        /** One-sentence concrete action summary. */
        summary: string;
        /** Capability description, including when this function is appropriate. */
        description: string;
        /** Explicit option declarations; pass an empty array for no options. */
        params: Array<{ name: string; type: string; required: boolean; description: string; default?: string | number | boolean; minimum?: number; maximum?: number }>;
        /** Explicit TypeScript return type. */
        returnType: string;
        /** Function body without the outer function declaration. */
        body: string;
        /** Emit a synchronous factory instead of an async procedure. @default false */
        synchronous?: boolean;
        /** Top-level external imports and local type aliases/interfaces only; no executable statements or project imports. @default "" */
        prelude?: string;
        /** Permit replacing an existing function. @default false */
        overwrite?: boolean;
        /** Generate and type-check without writing. @default false */
        dryRun?: boolean;
        /** Update the durable retrieval index after loading. @default false */
        index?: boolean;
        /** Set false to validate and write source without declarations, loading, or indexing, including rollback. Cannot combine with index:true. @default true */
        activate?: boolean;
    },
): Promise<any> {
    const root = opts.root ?? "src";
    const module = String(opts.module ?? "").trim();
    const name = String(opts.name ?? "").trim();
    assertInput(module, name, opts);
    if (opts.activate === false && opts.index) throw new TypeError("createFunction: activate:false cannot index");
    const project = ctx.fns.procs.project.projectRoot({});
    let rootDir = join(project, root);
    if (root !== "src" && root !== ".mauzcode") {
        if (!/^(plugin:[a-z][a-z0-9-]*|plugins\/[a-z][a-z0-9-]*\/src)$/.test(root)) throw new TypeError("createFunction: invalid runtime root");
        const roots = await ctx.fns.procs.modules.discover({});
        const selected = roots.find(r => !r.prefix && (r.source === "official" || r.source === "user") && (root.startsWith("plugin:") ? r.name === root.slice(7) : r.source === "official" && r.dir === rootDir));
        if (!selected) throw new TypeError("createFunction: root must be a mounted official/user plugin source");
        rootDir = await realpath(selected.dir);
    }
    // Reject symlinked module directories: authoring must remain inside its selected source root.
    const canonicalRoot = await realpath(rootDir).catch(() => rootDir);
    for (let dir = join(rootDir, module); dir !== rootDir; dir = dirname(dir)) {
        const actual = await realpath(dir).catch(() => null);
        if (actual && actual !== join(canonicalRoot, dir.slice(rootDir.length + 1))) throw new TypeError("createFunction: module escapes source root through symlink");
    }
    const rel = `${root}/${module}/${name}.ts`;
    const path = join(rootDir, module, `${name}.ts`);
    const source = render(opts);
    const syntax = new Bun.Transpiler({ loader: "ts" }).scan(source);
    void syntax;
    const staticValidation = await validateSource(source, opts);
    if (opts.dryRun && opts.activate !== false) return { ok: true, name: `${module.replaceAll("/", ".")}.${name}`, path: rel, source, written: false };
    if (!opts.dryRun && await Bun.file(path).exists() && !opts.overwrite) throw new Error(`createFunction: ${rel} already exists; use edit for updates or pass overwrite explicitly`);
    const previous = await Bun.file(path).exists() ? await Bun.file(path).text() : null;
    // Staging lives under host src so the host tsconfig also checks user-plugin functions.
    const temp = join(project, "src", ".authoring", module, `${name}.${crypto.randomUUID()}.ts`);
    await mkdir(dirname(temp), { recursive: true });
    await Bun.write(temp, source);
    const filter = temp.startsWith(project + "/") ? temp.slice(project.length + 1) : temp;
    let installed = false;
    try {
        const preflight = await ctx.fns.procs.dev.typecheck({ filter });
        if (!preflight.ok) throw new Error(`createFunction typecheck failed:\n${preflight.errors.join("\n")}`);
        const runtimeName = `${module.replaceAll("/", ".")}.${name}`;
        if (opts.dryRun) return { ok: true, name: runtimeName, path: rel, source, written: false, typecheck: preflight, validation: staticValidation };
        await mkdir(dirname(path), { recursive: true });
        await rename(temp, path);
        installed = true;
        if (opts.activate === false) return { ok: true, name: runtimeName, path: rel, created: previous == null, activated: false, typecheck: preflight, validation: staticValidation, index: null };
        await ctx.fns.procs.dev.genTypes({});
        await ctx.fns.procs.repl.load({ name: runtimeName });
        const validation = await ctx.fns.runtime.docs.validate({ name: runtimeName, strict: true, typecheck: true });
        if (!validation.ok) throw new Error(`createFunction validation failed: ${JSON.stringify(validation.errors)}`);
        const index = opts.index ? await ctx.fns.runtime.docs.index({ localizationBatch: 1 }) : null;
        return { ok: true, name: runtimeName, path: rel, created: previous == null, typecheck: preflight, validation, index };
    } catch (error) {
        if (installed) {
            if (previous == null) await rm(path, { force: true }); else await Bun.write(path, previous);
            if (opts.activate !== false) await ctx.fns.procs.dev.genTypes({});
        }
        throw error;
    } finally { await rm(temp, { force: true }); }
}

function assertInput(module: string, name: string, opts: any): void {
    if (!/^[a-z][A-Za-z0-9]*(\/[a-z][A-Za-z0-9]*)*$/.test(module)) throw new TypeError("createFunction: module must be a safe slash-separated identifier");
    if (!/^[a-z][A-Za-z0-9]*$/.test(name)) throw new TypeError("createFunction: name must be lower camelCase");
    if (String(opts.summary ?? "").trim().length < 12) throw new TypeError("createFunction: summary must be concrete and at least 12 characters");
    if (String(opts.description ?? "").trim().length < 24) throw new TypeError("createFunction: description must explain the capability");
    if (!Array.isArray(opts.params)) throw new TypeError("createFunction: params must be explicit, including []");
    if (!String(opts.returnType ?? "").trim() || !String(opts.body ?? "").trim()) throw new TypeError("createFunction: returnType and body are required");
    const seen = new Set<string>();
    for (const param of opts.params) {
        if (!/^[$A-Z_a-z][$\w]*$/.test(param.name) || seen.has(param.name)) throw new TypeError(`createFunction: invalid or duplicate parameter ${param.name}`);
        seen.add(param.name);
        if (!param.type || String(param.description ?? "").trim().length < 8 || typeof param.required !== "boolean") throw new TypeError(`createFunction: parameter ${param.name} requires type, required, and description`);
    }
}

function render(opts: any): string {
    const tags = opts.params.map((p: any) => ` * @param opts.${p.name} ${p.description}${p.default !== undefined ? ` @default ${p.default}` : ""}${p.minimum !== undefined ? ` @minimum ${p.minimum}` : ""}${p.maximum !== undefined ? ` @maximum ${p.maximum}` : ""}`);
    const fields = opts.params.map((p: any) => `        /** ${p.description}${p.default !== undefined ? ` @default ${p.default}` : ""}${p.minimum !== undefined ? ` @minimum ${p.minimum}` : ""}${p.maximum !== undefined ? ` @maximum ${p.maximum}` : ""} */\n        ${p.name}${p.required ? "" : "?"}: ${p.type};`).join("\n");
    const optsType = fields ? `{\n${fields}\n    }` : "{}";
    const body = String(opts.body).trim().split("\n").map((line: string) => `    ${line}`).join("\n");
    return `${opts.prelude ? String(opts.prelude).trim() + '\n' : ''}/**\n * ${String(opts.summary).trim()}\n *\n * ${String(opts.description).trim()}\n${tags.join("\n")}${tags.length ? "\n" : ""} */\nexport default ${opts.synchronous ? '' : 'async '}function (\n    ctx: Context,\n    session: Session | null,\n    opts: ${optsType},\n): ${String(opts.returnType).trim()} {\n${body}\n}\n`;
}

// Parse source without importing it or consulting the live registry. The loader's
// reflector is private and binds functions; it must not run in offline authoring.
async function validateSource(source: string, opts: any): Promise<{ ok: true; mode: "static"; parameters: number }> {
    const ts = await import("typescript");
    const sf = ts.createSourceFile("authored.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const diagnostics = (sf as typeof sf & { parseDiagnostics: readonly import("typescript").Diagnostic[] }).parseDiagnostics;
    if (diagnostics.length) throw new TypeError(`createFunction static syntax: ${diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, " ")).join("; ")}`);
    const decl = sf.statements[sf.statements.length - 1];
    for (const statement of sf.statements.slice(0, -1)) {
        if (ts.isImportDeclaration(statement)) {
            if (!ts.isStringLiteral(statement.moduleSpecifier)) throw new TypeError('createFunction prelude: literal external import required');
            const spec = statement.moduleSpecifier.text;
            if (!/^(node:|bun:|bun$|@?[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_.-]+)*)$/.test(spec) && !/^(node|bun):[A-Za-z0-9_/-]+$/.test(spec)) throw new TypeError('createFunction prelude: external imports only');
            if (spec.split('/').includes('..') || spec.startsWith('src/') || spec.startsWith('.')) throw new TypeError('createFunction prelude: project imports forbidden');
        } else if (!ts.isTypeAliasDeclaration(statement) && !ts.isInterfaceDeclaration(statement)) {
            throw new TypeError('createFunction prelude: only imports and local types are supported');
        }
        if (statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) throw new TypeError('createFunction prelude: exported declarations forbidden');
    }
    if (!decl || !ts.isFunctionDeclaration(decl) || !decl.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) || decl.parameters.length !== 3 || !decl.type) throw new TypeError("createFunction static metadata: expected one default function with three parameters and a return type");
    const docs = (decl as typeof decl & { jsDoc?: readonly import("typescript").JSDoc[] }).jsDoc;
    const doc = docs?.map(d => typeof d.comment === "string" ? d.comment : "").join("\n") ?? "";
    if (!doc.includes(String(opts.summary).trim()) || !doc.includes(String(opts.description).trim())) throw new TypeError("createFunction static metadata: missing capability documentation");
    const type = decl.parameters[2]?.type;
    if (!type || !ts.isTypeLiteralNode(type) || type.members.length !== opts.params.length) throw new TypeError("createFunction static metadata: options do not match declarations");
    for (let i = 0; i < type.members.length; i++) {
        const member = type.members[i];
        const param = opts.params[i];
        if (!member || !ts.isPropertySignature(member) || member.name.getText(sf) !== param.name || !member.type || !!member.questionToken === param.required) throw new TypeError(`createFunction static metadata: invalid parameter ${param.name}`);
        const text = member.getFullText(sf);
        if (!text.includes(`/** ${param.description}`) || /^(the )?.+ value used by the operation\.?$/i.test(param.description.trim())) throw new TypeError(`createFunction static metadata: parameter ${param.name} needs meaningful documentation`);
    }
    return { ok: true, mode: "static", parameters: type.members.length };
}
