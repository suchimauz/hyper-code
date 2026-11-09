import { expect, test } from 'vitest';
import source from './SecureInputDialog.tsx?raw';

test('native transient dialog keeps values out of React state and generic transports', async () => {
 expect(source).toContain('node.showModal()');
 expect(source).toContain('previous?.focus()');
 expect(source).toContain("input.current.value = ''");
 expect(source).toContain("'X-CSRF-Token': token.current");
 expect(source).toContain("mode: 'same-origin'");
 expect(source).toContain('maxLength={prompt.maxlength}');
 expect(source).toContain('expiresAt - Date.now()');
 expect(source).not.toContain('setValue');
 expect(source).not.toContain('localStorage');
 expect(source).not.toContain('console.');
 expect(source).not.toContain('hx-popup');
 expect(source).not.toContain('/rpc');
});
