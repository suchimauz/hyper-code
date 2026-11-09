export const hint = "last project test run of each kind (fast, integration, live) — totals, slowest files and tests, failures with their code, and a Run button — args `{}`";
export default {
    icon: "flask",
    live: true,
    prepare() { return { args: {}, title: "Tests" }; },
    render() { return '<p>Open Tests in the native Canvas viewer.</p>'; },
    describe() { return "live test-run report per kind (fast / integration / live / all, .runtime/test-report-<kind>.xml) with a Run button"; },
} satisfies types.canvas.Kind;
