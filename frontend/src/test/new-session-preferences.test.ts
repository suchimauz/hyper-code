import { afterEach, describe, expect, it } from 'vitest';
import { clearNewSessionDraft, persistNewSessionDraft, readNewSessionDraft, readSessionSelection, rememberSessionSelection, resolveNewSessionProject } from '../lib/newSession';

afterEach(() => { localStorage.clear(); sessionStorage.clear(); });
describe('new session preferences', () => {
  it('remembers the last visited project and explicitly selected model independently', () => {
    rememberSessionSelection({ projectId: 'first', model: 'provider:model' });
    rememberSessionSelection({ projectId: 'last' });
    expect(readSessionSelection()).toEqual({ projectId: 'last', model: 'provider:model' });
    expect(readNewSessionDraft()).toMatchObject({ projectId: 'last', model: 'provider:model', text: '', effort: '' });
  });
  it('keeps an unfinished draft and retains preferences after its successful creation', () => {
    rememberSessionSelection({ projectId: 'last', model: 'provider:last' });
    const draft = { ...readNewSessionDraft(), text: 'Unsent', model: 'provider:draft' };
    persistNewSessionDraft(draft); expect(readNewSessionDraft()).toEqual(draft);
    clearNewSessionDraft(); expect(readNewSessionDraft()).toMatchObject({ text: '', model: 'provider:last', projectId: 'last' });
  });
  it('uses available preferred workspace or the first active real workspace', () => {
    const projects = [{ id: 'archived', archived: true }, { id: 'virtual', virtual: true }, { id: 'first' }, { id: 'last' }];
    expect(resolveNewSessionProject(projects, 'last')).toBe('last');
    for (const unavailable of ['archived', 'virtual', 'deleted', undefined]) expect(resolveNewSessionProject(projects, unavailable)).toBe('first');
    expect(resolveNewSessionProject([], 'last')).toBe('');
  });
  it('ignores malformed stored values', () => {
    localStorage.setItem('hyper-ui-last-session-selection', '{broken'); expect(readSessionSelection()).toEqual({});
    localStorage.setItem('hyper-ui-last-session-selection', JSON.stringify({ model: {}, projectId: 5 })); expect(readSessionSelection()).toEqual({});
    sessionStorage.setItem('hyper-ui-new-session', '{broken'); expect(readNewSessionDraft().text).toBe('');
  });
});
