export const hint = 'Search and preview the local Lucide SVG catalogue, inspect tags and download icons — args `{}`; English name and tag search.';

export default {
    icon: "shapes",
    async prepare(_ctx: Context, _opts: { agentId: string; args: Record<string, any> }) {
        return { args: {}, title: "Lucide Icons" };
    },
    render() { return '<p>Open Lucide Icons in the native Canvas viewer.</p>'; },
    describe() {
        return "Local Lucide catalogue with English name/tag search, SVG previews and downloads";
    },
} satisfies types.canvas.Kind;
