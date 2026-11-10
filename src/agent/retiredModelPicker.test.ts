import { expect, test } from 'bun:test';

test('model selection uses the native picker and catalog, not the retired popup', async () => {
    for (const file of ['modelPicker.ts', 'modelPickerHtml.ts']) {
        expect(await Bun.file(new URL(file, import.meta.url)).exists()).toBe(false);
    }
    const picker = await Bun.file(new URL('../../frontend/src/components/mauzcode/ModelPicker.tsx', import.meta.url)).text();
    expect(picker).toContain('export function ModelPicker');
    expect(picker).not.toContain('/rpc');
    const footer = await Bun.file(new URL('../../frontend/src/components/mauzcode/ComposerFooter.tsx', import.meta.url)).text();
    const draft = await Bun.file(new URL('../../frontend/src/components/mauzcode/NewSessionComposer.tsx', import.meta.url)).text();
    expect(footer).toContain('<ModelPicker');
    expect(draft).toContain('<ModelPicker');
});
