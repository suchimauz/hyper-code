/**
 * Close the MauzCode-owned Vite server during lifecycle shutdown
 *
 * Release the Vite HTTP listener, HMR connections and watchers during MauzCode shutdown. Safe to call when no frontend server is running.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{ stopped: boolean }> {
    const state = ctx.state as typeof ctx.state & { frontendRuntime?: { server?: import("vite").ViteDevServer } };
    const server = state.frontendRuntime?.server;
    if (!server) return { stopped: false };
    await server.close();
    delete state.frontendRuntime!.server;
    return { stopped: true };
}
