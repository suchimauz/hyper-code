import { expect, it } from 'vitest';
import { toolSummary } from '../components/hyper/toolSummary';
it('uses dsh per-tool summary priorities and only the first line', () => {
  expect(toolSummary('bash', { command: 'git diff', description: 'Проверить изменения\nextra' })).toBe('Проверить изменения');
  expect(toolSummary('bash', { command: 'git diff\ngit status' })).toBe('git diff');
  expect(toolSummary('read', { path: 'src/deep/App.tsx', description: 'ignored' })).toBe('src/deep/App.tsx');
  expect(toolSummary('edit', { file_path: 'src/a.ts' })).toBe('src/a.ts');
  expect(toolSummary('grep', { path: 'src', pattern: 'fallback', query: 'wanted' })).toBe('wanted');
  expect(toolSummary('find', { path: 'src', pattern: '**/*.ts' })).toBe('**/*.ts');
  expect(toolSummary('grep', { queries: ['one\nextra', 'two'] })).toBe('one, two');
  expect(toolSummary('tools_eval', { code: 'return 1', description: 'Check runtime' })).toBe('Check runtime');
  expect(toolSummary('unknown', {})).toBe('');
});
