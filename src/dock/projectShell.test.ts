import { test, expect } from 'bun:test';

// Interactive sidebar behavior is exercised by frontend/src/test/workspace-sidebar.test.tsx.
// These boundaries ensure deleting the old renderer does not delete its domain APIs.
test('native workspace shell replaces Dock rendering while pin and layout ownership remain', async () => {
  expect(await Bun.file(`${import.meta.dir}/render.ts`).exists()).toBe(false);
  for (const name of ['items.ts', 'pin.ts', 'saveLayout.ts']) {
    expect(await Bun.file(`${import.meta.dir}/${name}`).exists()).toBe(true);
  }
  const shell = await Bun.file(`${import.meta.dir}/../../frontend/src/LiveApp.tsx`).text();
  expect(shell).toContain('WorkspaceSidebar');
  expect(shell).toContain('SettingsDialog');
  expect(shell).not.toContain('dock.render');
});
