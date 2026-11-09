import { expect, test } from 'bun:test';

// The React shell does not mount the former HTMX inspector. Do not leave its
// RPC data loader or fragment GET available as an alternate metadata surface.
test('retired inspector loaders and assets are absent', async () => {
    for (const name of ['agentMetaSection.ts', 'agentMetaSectionHtml.ts', '$script_meta.js', 'agentSettingsBlocks.ts', 'planTaskRow.ts', 'parkedCard.ts', '$route_agent_$id_plan_task_GET.ts']) {
        expect(await Bun.file(new URL(name, import.meta.url)).exists()).toBe(false);
    }
});

test('shared plugin inspector primitive and domain mutation handlers remain', async () => {
    for (const name of ['./inspectorSection.ts', '../agent/compactionPost.ts', '../agent/setCompaction.ts', '../agent/$route_$id_plan_POST.ts', '../events/refreshAgentMeta.ts']) {
        expect(await Bun.file(new URL(name, import.meta.url)).exists()).toBe(true);
    }
});
