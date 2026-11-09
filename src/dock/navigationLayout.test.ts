import { test, expect } from 'bun:test';

// Native interaction coverage lives in workspace-sidebar.test.tsx rather than
// executing the retired HTMX Dock script against a synthetic DOM.
test('native shell owns sidebar compact state and mobile navigation', async () => {
  expect(await Bun.file(`${import.meta.dir}/$script_dock.js`).exists()).toBe(false);
  const shell = await Bun.file(`${import.meta.dir}/../../frontend/src/LiveApp.tsx`).text();
  expect(shell).toContain('sidebarCompact');
  expect(shell).toContain('WorkspaceSidebar');
  expect(shell).toContain('<Sheet');
  expect(shell).not.toContain('/dock/dock.js');
});
