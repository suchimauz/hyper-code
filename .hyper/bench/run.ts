type TaskSpec = {
    id: string;
    title: string;
    build: (ctx: Context, dir: string) => Promise<{ prompt: string; expected: any }>;
    check: (ctx: Context, dir: string, finalText: string, expected: any) => Promise<{ pass: boolean; detail: string }>;
};

const TASKS: TaskSpec[] = [
    {
        id: "count",
        title: "Count source files with tools",
        build: async (ctx, dir) => {
            const names = ["alpha.ts", "beta.ts", "gamma.test.ts", "delta.tsx", "notes.md", "eps.test.ts", "zeta.ts"];
            for (const n of names) await ctx.fns.files.write({ path: dir + "/" + n, content: "// fixture\n" });
            await ctx.fns.files.mkdir({ path: dir + "/nested" });
            await ctx.fns.files.write({ path: dir + "/nested/inner.ts", content: "// fixture\n" });
            return {
                prompt: "В рабочем каталоге посчитай, сколько TypeScript-файлов (.ts) и сколько из них — тесты (*.test.ts). Файлы .tsx и .md не считай. Ответь одной строкой: total=<число> tests=<число>. Считай инструментами (find/grep/bash), не по памяти.",
                expected: { total: 6, tests: 2 },
            };
        },
        check: async (_ctx, _dir, text, expected) => {
            const hasTotal = /total\s*=\s*(\d+)/i.exec(text);
            const hasTests = /tests\s*=\s*(\d+)/i.exec(text);
            if (!hasTotal || !hasTests) return { pass: false, detail: "нет пары total=/tests=" };
            const t = Number(hasTotal[1]);
            const s = Number(hasTests[1]);
            const ok = t === expected.total && s === expected.tests;
            return { pass: ok, detail: `ответ total=${t} tests=${s}, эталон total=${expected.total} tests=${expected.tests}` };
        },
    },
    {
        id: "bughunt",
        title: "Find a planted bug in a file",
        build: async (ctx, dir) => {
            const file = dir + "/billing.ts";
            const token = "BUGMARK-7Q2";
            await ctx.fns.files.write({
                path: file,
                content: [
                    "export function total(items: number[], tax: number): number {",
                    "  let sum = 0;",
                    "  for (const item of items) {",
                    "    sum += item;",
                    "  }",
                    "  return sum * tax;",
                    "}",
                    "",
                    "// NOTE: " + token,
                    "",
                ].join("\n"),
            });
            return {
                prompt: "В файле billing.ts в рабочем каталоге есть баг: функция total считает сумму и применяет налог, но результат неверен. Прочитай файл, найди ошибку и в конце ответа напиши маркер В ТОЧНОСТИ как он записан в комментарии последней строки файла (например XXXX-123), без перевода и без изменения написания, и кратко опиши исправление. Не изменяй файл — только найди и объясни.",
                expected: token,
            };
        },
        check: async (_ctx, _dir, text, expected) => {
            const hasMarker = text.includes(expected);
            const hasFix = /(sum|сумм|tax|налог|\\*|умнож|дел)/i.test(text);
            return { pass: hasMarker && hasFix, detail: `маркер=${hasMarker} объяснение=${hasFix}` };
        },
    },
    {
        id: "writeverify",
        title: "Create a file and verify it by reading back",
        build: async (_ctx, dir) => ({
            prompt: "Создай в рабочем каталоге файл report.txt ровно с одной строкой: OK-42. Затем перечитай файл инструментом read и в ответе напиши строку checked=OK-42 только если в файле именно OK-42. Если файл отличается — так и напиши.",
            expected: "OK-42",
        }),
        check: async (ctx, dir, text, expected) => {
            const p = dir + "/report.txt";
            const exists = await ctx.fns.files.exists({ path: p });
            let content = "";
            if (exists) content = String((await ctx.fns.files.read({ path: p })) ?? "").trim();
            const okFile = exists && content === expected;
            const okClaim = /checked\s*=\s*OK-42/i.test(text);
            return { pass: okFile && okClaim, detail: `файл=${okFile ? "верный" : "нет/неверный (" + content + ")"} заявление=${okClaim}` };
        },
    },
    {
        id: "analysis",
        title: "Compute sum and median of a data file",
        build: async (ctx, dir) => {
            const nums: number[] = [];
            let seed = 42;
            for (let i = 0; i < 100; i += 1) {
                seed = (seed * 1103515245 + 12345) % 2147483648;
                nums.push((seed % 997) + 1);
            }
            const sorted = [...nums].sort((a, b) => a - b);
            const sum = nums.reduce((a, b) => a + b, 0);
            const median = ((sorted[49] ?? 0) + (sorted[50] ?? 0)) / 2;
            await ctx.fns.files.write({ path: dir + "/data.txt", content: nums.join("\n") + "\n" });
            return {
                prompt: "В файле data.txt лежат 100 целых чисел, по одному в строке. Посчитай их сумму и медиану. Обязательно используй инструменты для чтения и вычисления. Ответь одной строкой: sum=<число> median=<число>.",
                expected: { sum, median },
            };
        },
        check: async (_ctx, _dir, text, expected) => {
            const m = /sum\s*=\s*(\d+(?:\.\d+)?)/i.exec(text);
            const md = /median\s*=\s*(\d+(?:\.\d+)?)/i.exec(text);
            if (!m || !md) return { pass: false, detail: "нет пары sum=/median=" };
            const sOk = Number(m[1]) === expected.sum;
            const mdVal = Number(md[1]);
            const mdOk = Math.abs(mdVal - expected.median) <= 1;
            return { pass: sOk && mdOk, detail: `sum=${m[1]} (эталон ${expected.sum}), median=${md[1]} (эталон ${expected.median})` };
        },
    },
    {
        id: "fixcode",
        title: "Fix a failing function and verify with a real run",
        build: async (ctx, dir) => {
            const token = "FIXMARK-5K8";
            await ctx.fns.files.write({
                path: dir + "/calc.ts",
                content: [
                    "export function average(xs: number[]): number {",
                    "  return xs.reduce((a, b) => a + b, 0) / (xs.length - 1);",
                    "}",
                    "",
                    "// " + token,
                    "",
                ].join("\n"),
            });
            await ctx.fns.files.write({
                path: dir + "/check.ts",
                content: [
                    "import { average } from './calc';",
                    "const v = average([10, 20, 30]);",
                    "console.log('value=' + v);",
                    "",
                ].join("\n"),
            });
            return {
                prompt: "В файле calc.ts есть баг: функция average считает среднее неверно (проверь на [10,20,30] — должно быть 20). Исправь calc.ts и затем выполни check.ts (например, через bun), чтобы убедиться, что вывод value=20. В конце ответа скопируй ровно маркер из комментария в calc.ts (например XXXX-123, в точности как записано) и приведи фактический вывод команды.",
                expected: { token, value: "value=20" },
            };
        },
        check: async (_ctx, _dir, text, expected) => {
            const marker = text.includes(expected.token);
            const val = text.includes(expected.value) || /value\s*=\s*20\b/.test(text);
            return { pass: marker && val, detail: `маркер=${marker} значение20=${val}` };
        },
    },
    {
        id: "grepalias",
        title: "Multi-file search and precise counting",
        build: async (ctx, dir) => {
            const files = ["a.ts", "b.ts", "c.ts", "d.ts"];
            const bodies = [
                "export const handler = () => 1;\n// TODO: refactor\n",
                "export const helper = () => 2;\n",
                "import { handler } from './a';\nexport const use = () => handler();\n",
                "export const other = () => 4;\n// TODO: refactor\n",
            ];
            for (let i = 0; i < files.length; i += 1) await ctx.fns.files.write({ path: dir + "/" + (files[i] ?? ""), content: bodies[i] ?? "" });
            return {
                prompt: "В рабочем каталоге несколько .ts файлов. Найди все файлы, где встречается текст `TODO: refactor`, и все файлы, где встречается `handler`. Ответь двумя строками: todo=<файлы через запятую> handler=<файлы через запятую>. Используй поисковые инструменты.",
                expected: { todo: ["a.ts", "d.ts"], handler: ["a.ts", "c.ts"] },
            };
        },
        check: async (_ctx, _dir, text, expected) => {
            const todoPart = /todo\s*=\s*(.*?)(?:\s+handler\s*=|\n|$)/i.exec(text);
            const handlerPart = /handler\s*=\s*(.*?)(?:\n|$)/i.exec(text);
            if (!todoPart || !handlerPart) return { pass: false, detail: "нет пары todo=/handler=" };
            const norm = (s: string) => s.toLowerCase().split(",").map((x) => x.trim().replace(/[^a-z.]/g, "")).filter(Boolean).sort();
            const todoValue = todoPart[1] ?? "";
            const handlerValue = handlerPart[1] ?? "";
            const tOk = JSON.stringify(norm(todoValue)) === JSON.stringify(expected.todo);
            const hOk = JSON.stringify(norm(handlerValue)) === JSON.stringify(expected.handler);
            return { pass: tOk && hOk, detail: `todo=${todoValue.trim()} (эталон ${expected.todo.join(",")}), handler=${handlerValue.trim()} (эталон ${expected.handler.join(",")})` };
        },
    },
    {
        id: "runtests",
        title: "Make a failing test pass",
        build: async (ctx, dir) => {
            await ctx.fns.files.write({
                path: dir + "/math.ts",
                content: "export function add(a: number, b: number): number {\n  return a - b;\n}\n",
            });
            await ctx.fns.files.write({
                path: dir + "/math.test.ts",
                content: "import { expect, test } from 'bun:test';\nimport { add } from './math';\n\ntest('add', () => {\n  expect(add(2, 3)).toBe(5);\n});\n",
            });
            return {
                prompt: "В рабочем каталоге есть math.ts и math.test.ts. Запусти тесты (bun test) и исправь код так, чтобы тест проходил. Запусти тесты ещё раз, чтобы убедиться, и в конце ответа напиши tests=pass (или tests=fail, если исправить не удалось).",
                expected: "tests=pass",
            };
        },
        check: async (ctx, dir, text, expected) => {
            const claimed = /tests\s*=\s*pass/i.test(text);
            const src = String((await ctx.fns.files.read({ path: dir + "/math.ts" })) ?? "");
            const fixed = /a\s*\+\s*b/.test(src);
            let realPass = false;
            try {
                const proc = Bun.spawn(["bun", "test"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
                await proc.exited;
                realPass = proc.exitCode === 0;
            } catch (e: any) {
                realPass = false;
            }
            return { pass: claimed && fixed && realPass, detail: `заявлен успех=${claimed} код исправлен=${fixed} реальный bun test=${realPass}` };
        },
    },
    {
        id: "puzzle",
        title: "Multi-constraint logic puzzle",
        build: async (_ctx, _dir) => ({
            prompt: "Задача. Есть 4 коробки с замками. Коробка A содержит 2 яблока, B — 3, C — 4, D — 5. Каждая коробка заперта на один из 4 разных кодов (5, 11, 13, 17). Известно:\n1) Код коробки B больше кода коробки A.\n2) Код коробки D — 5.\n3) Код коробки C — 13.\n4) Код коробки A — 11.\nСколько яблок в коробке, запертой на код 11, и какой код у коробки с 4 яблоками? Ответь одной строкой в формате: apples11=<число> code4=<число>.",
            expected: { apples11: 2, code4: 13 },
        }),
        check: async (_ctx, _dir, text, expected) => {
            const strict = /apples11\s*=\s*(\d+)/i.exec(text);
            const strictC = /code4\s*=\s*(\d+)/i.exec(text);
            const aOk = strict ? Number(strict[1]) === expected.apples11 : false;
            const cOk = strictC ? Number(strictC[1]) === expected.code4 : false;
            const formatOk = !!strict && !!strictC;
            if (!formatOk) return { pass: false, detail: "не соблюден формат apples11=/code4=" };
            return { pass: aOk && cOk, detail: `apples11=${strict[1]} (эталон ${expected.apples11}), code4=${strictC[1]} (эталон ${expected.code4})` };
        },
    },
    {
        id: "multistep",
        title: "Follow a strict ordered instruction list",
        build: async (ctx, dir) => {
            await ctx.fns.files.write({ path: dir + "/log.txt", content: "alpha\nbeta\ngamma\n" });
            return {
                prompt: "Выполни шаги строго по порядку, каждый отдельным инструментом:\n1) Прочитай log.txt.\n2) Создай файл out.txt с содержимым \"step2\".\n3) Допиши в out.txt строку \"step3\".\n4) Перечитай out.txt и в ответе напиши final=step2,step3 (через запятую, в этом порядке).",
                expected: "final=step2,step3",
            };
        },
        check: async (ctx, dir, text, expected) => {
            const claimed = /final\s*=\s*step2\s*,\s*step3/i.test(text);
            const content = String((await ctx.fns.files.read({ path: dir + "/out.txt" })) ?? "").replace(/\s+/g, " ").trim();
            const fileOk = content.includes("step2") && content.includes("step3");
            return { pass: claimed && fileOk, detail: `заявлено=${claimed} файл=${JSON.stringify(content)}` };
        },
    },
    {
        id: "notools",
        title: "Answer from memory without tools",
        build: async (_ctx, _dir) => ({
            prompt: "Ответь по памяти, НЕ вызывая никаких инструментов: какая страна имеет самый длинный берег? Ответь одним предложением.",
            expected: "Канада",
        }),
        check: async (_ctx, _dir, text, expected) => {
            const has = /канад/i.test(text);
            return { pass: has, detail: has ? "ответ верный" : "ответ неверный" };
        },
    },
];

/**
 * Run a repeatable benchmark suite for one or more coding models.
 *
 * Creates an isolated child agent per task with a fresh workspace and a
 * self-contained fixture, runs one agent turn, checks the answer and the
 * produced files against an objective expectation, and reports pass/fail,
 * native tool-call count, used tools, wall-clock time and token usage.
 * Use it to compare models on identical tool-use tasks before choosing one.
 * @param opts.models Provider-qualified models to benchmark, e.g. "oneapi:qwen3.8-flash-next".
 * @param opts.tasks Task ids to run; omitted runs every task.
 * @param opts.label Optional label stored with the run for later comparison.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Provider-qualified models to benchmark. */
        models: string[];
        /** Task ids to run; omitted runs every task. */
        tasks?: string[];
        /** Optional label for the run. */
        label?: string;
    },
): Promise<any> {
    const models = (opts.models ?? []).map((m) => String(m).trim()).filter(Boolean);
    if (!models.length) throw new Error("bench.run: models is required");
    const wanted = opts.tasks?.length ? new Set(opts.tasks) : null;
    const results: any[] = [];
    for (const model of models) {
        for (const task of TASKS) {
            if (wanted && !wanted.has(task.id)) continue;
            const dir = await ctx.fns.workspace.tmp({ path: "bench/" + model.replace(/[^a-zA-Z0-9._-]/g, "_") + "/" + task.id, mkdir: true });
            await ctx.fns.files.mkdir({ path: dir });
            const built = await task.build(ctx, dir);
            const child = await ctx.fns.agent.start({
                model,
                title: "bench:" + task.id,
                workspaceDir: dir,
                visibility: "hidden",
                systemPrompt: "Ты участник автоматического теста. Работай точно, отвечай по факту, проверяй результат инструментами, если это требуется в задании.",
            });
            const started = Date.now();
            let finalText = "";
            let usage: any = null;
            let error: string | null = null;
            try {
                const run = await ctx.fns.agent.run({ agent: child, userText: built.prompt });
                finalText = String((run as any)?.text ?? "");
                usage = (run as any)?.usage ?? null;
            } catch (e: any) {
                error = String(e?.message ?? e);
            }
            const elapsed = Date.now() - started;
            const messages = await ctx.fns.session.getMessages({ id: child.id });
            let toolCalls = 0;
            const toolNames = new Set<string>();
            for (const m of messages as any[]) {
                const calls = m?.tool_calls ?? [];
                if (Array.isArray(calls) && calls.length) {
                    toolCalls += calls.length;
                    for (const c of calls) toolNames.add(String(c?.function?.name ?? c?.name ?? "?"));
                }
            }
            const check = error ? { pass: false, detail: "ошибка запуска: " + error } : await task.check(ctx, dir, finalText, built.expected);
            results.push({
                model,
                task: task.id,
                title: task.title,
                pass: !!check.pass,
                detail: check.detail,
                toolCalls,
                tools: [...toolNames],
                elapsedMs: elapsed,
                usage,
                finalText: finalText.slice(0, 600),
            });
        }
    }
    return { label: opts.label ?? null, at: new Date().toISOString(), results };
}
