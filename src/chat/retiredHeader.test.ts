import { expect, test } from 'bun:test';

// The React toolbar and Meta panel own chat management. Do not restore a second
// HTML panel or its browser event listeners while secure input documents remain.
test('legacy chat header and lazy panel renderer are absent', async () => {
    for (const name of ['header.ts', 'panel.ts', '$route_$id_panel_GET.ts', '$script_header.js', 'renderParts.ts', 'renderItem.ts', 'renderCardRows.ts', 'buildRenderContext.ts', 'withTimeout.ts', 'modelChip.ts', 'contextRing.ts', '$route_$id_ring_GET.ts', '$loader_chatbadge.ts', '$loader_chatbutton.ts', '$loader_chatcard.ts', 'register.ts', 'listParts.ts', 'readLayout.ts', '$setting_layout.ts', 'compactForm.ts', 'compactPopup.ts', 'renamePopup.ts', 'iconPopup.ts', 'saveIcon.ts']) {
        expect(await Bun.file(new URL(`./${name}`, import.meta.url)).exists()).toBe(false);
    }
});

test('chat domain actions and secure input transports remain available', async () => {
    for (const path of ['session/setTitle.ts', 'chat/setIcon.ts', 'chat/sanitizeSvg.ts', 'agent/compactContext.ts', 'input/compatView.ts', 'input/$route_$id_POST.ts']) {
        expect(await Bun.file(new URL(`../${path}`, import.meta.url)).exists()).toBe(true);
    }
});

test("legacy statusbar renderer and route are absent", async () => {
    for (const path of ["agent/renderStatusBar.ts", "agent/$route_$id_statusbar_GET.ts"]) {
        expect(await Bun.file(new URL(`../${path}`, import.meta.url)).exists()).toBe(false);
    }
});
