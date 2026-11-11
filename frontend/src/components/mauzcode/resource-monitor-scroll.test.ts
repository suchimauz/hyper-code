import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'resource-monitor.css'), 'utf8');

// DOM emulators cannot simulate native touch scrolling; verify on iOS/Android too.
function declarations(selector: string) {
  const rule = css.split('}').find(part => part.slice(0, part.indexOf('{')).trim().endsWith(selector));
  expect(rule, `Missing scroll boundary: ${selector}`).toBeDefined();
  return rule!.slice(rule!.indexOf('{') + 1);
}

test('resource dialog boundaries suppress horizontal bounce but preserve native vertical behavior', () => {
  for (const selector of ['.mauzcode-sdk-dialog:has(.resource-monitor)', '.resource-monitor', '.resource-monitor-cores', '.resource-monitor-table', 'body:has(.resource-monitor) .mauzcode-sdk-dialog-backdrop']) {
    expect(declarations(selector)).toMatch(/overscroll-behavior-x:\s*none\s*;/);
  }
  for (const selector of ['.resource-monitor-cores', '.resource-monitor-table']) {
    expect(declarations(selector)).toMatch(/overflow:\s*auto\s*;/);
  }
  expect(declarations('.resource-monitor-table')).toMatch(/max-width:\s*100%\s*;/);
  expect(css).not.toMatch(/touch-action:\s*none|overscroll-behavior(?:-y)?:/);
});

test('resource dialog matches the quota height cap with an internally scrolling body and fixed header', () => {
  const dialog = declarations('.mauzcode-sdk-dialog:has(.resource-monitor)');
  expect(dialog).toContain('max-height: min(800px, calc(100dvh - 48px))');
  expect(dialog).toContain('overflow: hidden');
  expect(declarations('.mauzcode-sdk-dialog:has(.resource-monitor) > header')).toContain('flex: none');
  const body = declarations('.resource-monitor');
  expect(body).toContain('min-height: 0');
  expect(body).toContain('overflow-y: auto');
  expect(body).toContain('overflow-x: hidden');
});
