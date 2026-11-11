import { resolve } from "node:path";

const CORE_PATH = resolve(import.meta.dir, "SYSTEM_PROMPT_CORE.txt");

/**
 * Read the core system prompt for callers that need the legacy prompt-parts shape.
 * Returns an empty wire section because native tool calls replaced the wire protocol.
 * Core file read failures propagate to the caller.
 */
export default async function (_ctx: Context, _session: Session | null, _opts?: {}): Promise<{ core: string; wire: string }> {
    const core = await Bun.file(CORE_PATH).text();
    return { core, wire: "" };
}