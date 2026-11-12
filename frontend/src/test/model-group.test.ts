import { expect, test } from 'vitest';
import { modelGroup, modelSourceLabel, parseModelRoute } from '../lib/models';
test('ssh models are grouped per host provider account', () => {
  expect(modelGroup({ provider: 'ssh/h', model: 'ssh/h:codex/me:gpt-6' })).toBe('h · codex/me');
  expect(modelGroup({ provider: 'ssh/h', model: 'ssh/h:claude-code/you:claude-opus-5' })).toBe('h · claude-code/you');
  expect(modelGroup({ provider: 'openai', model: 'openai/default:gpt-5' })).toBe('openai');
});
test('legacy aliases parse onto the canonical route template', () => {
  expect(parseModelRoute('openai:gpt-5').route).toBe('openai/default:gpt-5');
  expect(parseModelRoute('qwen3').route).toBe('lmstudio/default:qwen3');
  expect(parseModelRoute('ssh/h:codex/me:gpt-6')).toMatchObject({ host: 'h', provider: 'codex', account: 'me', model: 'gpt-6' });
  expect(modelSourceLabel('ssh/h:codex/me:gpt-6')).toBe('codex · me');
});
test('SOCKS5 group labels distinguish accounts without changing routes', () => {
  const model = 'anthropic-oauth/work:claude-opus-4-6';
  expect(modelGroup({provider:'anthropic-oauth', model, groupLabel:'socks5 · Office · claude/work'})).toBe('socks5 · Office · claude/work');
  expect(modelGroup({provider:'anthropic-oauth', model})).toBe('anthropic-oauth');
});
