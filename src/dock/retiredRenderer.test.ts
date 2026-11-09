import { expect, test } from "bun:test";

// The native menu projection still consumes widget declarations. Retiring a dead
// Dock renderer must not accidentally retire that independent API contract.
test("retired Dock popup renderer is absent while native widget projection remains", async () => {
    expect(await Bun.file(`${import.meta.dir}/drawButton.ts`).exists()).toBe(false);
    expect(await Bun.file(`${import.meta.dir}/../ui/inplacePopup.ts`).exists()).toBe(false);
    const projection = await Bun.file(`${import.meta.dir}/../frontendBridge/searchData.ts`).text();
    expect(projection).toContain("def.render(ctx,session");
    expect(await Bun.file(`${import.meta.dir}/../nav/$loader_widget.ts`).exists()).toBe(true);
    expect(await Bun.file(`${import.meta.dir}/../ui/popup.ts`).exists()).toBe(false);
});
