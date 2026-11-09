/** Read the bundled Lucide catalogue for the authenticated native icon browser. */
export default async function (_ctx: Context, _session: Session | null, _opts: { req: Request }) {
    const { fileURLToPath } = await import("node:url");
    return Response.json(await Bun.file(fileURLToPath(new URL("../../assets/catalog.json", import.meta.url))).json());
}
