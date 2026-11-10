import { test, expect } from 'bun:test';

test('global extension pages use explicit native capability, while chat panels retain archive-aware context', async () => {
 const source=await Bun.file(new URL('../../frontend/src/LiveApp.tsx',import.meta.url)).text();
 expect(source).toContain('context={{ agentId: null, theme, readOnly: navigation.canManage !== true }}');
 expect(source).not.toContain("navigation.user?.role !== 'owner'");
 expect(source).toContain('const readOnly = archived ||');
 expect(source).toContain('const extensionContext = { agentId: mauzcode.selected || null, theme, readOnly };');
 expect(source).toContain('view={activeExtensionPanel} context={extensionContext}');
});
