import { expect, test } from 'bun:test';
import promptSection from './promptSection';

function render(kinds: Array<{ name: string; hint: string | null }>) {
    return promptSection({ fns: { input: { kinds: () => kinds } } } as unknown as Context, null, {});
}

test('batch prompt explains explicit waiting, editable drafts and atomic collection only while mounted', () => {
    const text = render([{ name: 'batch', hint: 'collect several questions' }, { name: 'choice', hint: 'choose one' }]);
    for (const expected of ["kind:'batch'", 'waitForAnswer:true', '1–30 steps', 'edit drafts', 'one aggregate input-result', 'no partial answers', 'no external actions', 'own exact approval', 'do not poll']) expect(text).toContain(expected);
    expect(text).toContain('- `batch` — collect several questions');
});

test('standalone-only registry does not advertise an unavailable batch capability', () => {
    expect(render([{ name: 'choice', hint: 'choose one' }])).not.toContain("kind:'batch'");
    expect(render([{ name: 'planning-review', hint: null }])).toBe('');
});
