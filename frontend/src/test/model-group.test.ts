import { expect, test } from 'vitest';
import { modelGroup } from '../lib/models';
test('ssh models are grouped per host provider account', () => {
  expect(modelGroup({ provider: 'ssh/h', model: 'ssh/h:codex/me:gpt-6' })).toBe('h · codex/me');
  expect(modelGroup({ provider: 'ssh/h', model: 'ssh/h:claude-code/you:claude-opus-5' })).toBe('h · claude-code/you');
  expect(modelGroup({ provider: 'openai', model: 'openai:gpt-5' })).toBe('openai');
});
