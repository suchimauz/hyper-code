import { expect, test } from 'bun:test';

const css = await Bun.file(new URL('./$style_app.css', import.meta.url)).text();

test('warning is independent from error in both themes', () => {
  expect(css).toContain('--color-warning: var(--theme-warning)');
  expect(css).toContain('--color-error: var(--theme-danger)');
  for (const theme of ['light', 'dark']) {
    const block = css.match(new RegExp('\\[data-theme="' + theme + '"\\] \\{([^}]+)'))![1]!;
    const token = (name: string) => block.match(new RegExp('--theme-' + name + ': ([^;]+)'))![1];
    expect(token('warning')).not.toBe(token('danger'));
    for (const name of ['text-muted', 'text-subtle', 'text-faint', 'focus', 'press']) expect(token(name)).toBeTruthy();
  }
});

test('shared visual feedback never changes geometry or typography', () => {
  const feedback = css.split('/* Shared visual feedback only:')[1]!;
  expect(feedback).toBeTruthy();
  const properties = [...feedback.matchAll(/^\s*([a-z-]+):/gm)].map(match => match[1]);
  const allowed = new Set(['outline', 'outline-offset', 'box-shadow', 'transition-duration', 'transition', 'background-color', 'backdrop-filter', '-webkit-backdrop-filter']);
  for (const property of properties) expect(property!.startsWith('--') || allowed.has(property!)).toBe(true);
  expect(feedback).toContain(':not(:disabled):not([aria-disabled="true"]):active');
  for (const preference of ['reduced-motion', 'reduced-transparency', 'contrast']) expect(feedback).toContain('prefers-' + preference);
  expect(feedback).not.toMatch(/transform\s*:|font-size\s*:|padding\s*:|margin\s*:/);
});

test('composer text has no inner focus rectangle while keyboard controls retain focus styling', () => {
  expect(css).toContain('.chat-composer textarea:focus-visible { outline: none; }');
  expect(css).toContain(':where(button, a[href], summary, input, textarea, select, [tabindex]):focus-visible');
  expect(css).toContain('outline: 2px solid var(--theme-focus)');
});
