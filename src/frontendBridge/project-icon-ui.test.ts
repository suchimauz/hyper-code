import { expect, test } from 'bun:test';

test('native icon editor uses explicit JSON save and no popup transport', async () => {
 const ui=await Bun.file('frontend/src/components/hyper/ProjectIconDialog.tsx').text();
 const sidebar=await Bun.file('frontend/src/components/hyper/WorkspaceSidebar.tsx').text();
 expect(ui).toContain('async function save()');
 expect(ui).toContain("method: 'POST'");
 expect(ui).toContain("'x-csrf-token': token");
 expect(ui).toContain('event.preventDefault(); void save();');
 expect(ui).toContain('Custom SVG'); expect(ui).toContain('Emoji or letters'); expect(ui).toContain('Default folder');
 expect(ui).toContain('onClick={onClose}>Cancel');
 expect(ui).toContain('if (lock.current || !token) return');
 expect(ui).not.toContain('hx-popup');
 expect(sidebar).toContain('Edit project icon'); expect(sidebar).toContain('<ProjectIconDialog');
 expect(await Bun.file('src/projects/iconPopup.ts').exists()).toBe(false);
 expect(await Bun.file('src/projects/saveIcon.ts').exists()).toBe(false);
 expect(await Bun.file('src/projects/setIcon.ts').exists()).toBe(true);
});
