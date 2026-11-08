/**
 * Start the local Vite frontend development server for the Hyper lifecycle
 *
 * Start an in-process Vite server on fixed loopback port 5174 before Hyper accepts HTTP traffic. Repeated starts reuse the live server; failed starts close partially created resources.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{ port: number }> {
    const state = ctx.state as typeof ctx.state & { frontendRuntime?: { server?: import("vite").ViteDevServer } };
    if (state.frontendRuntime?.server) return { port: 5174 };
    const { createServer } = await import("vite");
    const root = ctx.fns.procs.project.projectRoot({});
    const server = await createServer({ configFile: `${root}/frontend/vite.config.ts` });
    try { await server.listen(); } catch (error) { await server.close(); throw error; }
    (state.frontendRuntime ??= {}).server = server;
    return { port: 5174 };
}
