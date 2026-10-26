import { expect, test } from 'bun:test';
import render from './planTaskRow';
import { renderCtx } from './testRender.entry';

const ctx = await renderCtx();

test('plan task row uses ordinary repeated form fields', () => {
    const html = render(ctx, null, { task: { id: 't1', title: 'Build', instructions: 'Do it', status: 'pending', elapsedMs: 0 } });
    expect(html).toContain('name="task_id" value="t1"');
    expect(html).toContain('name="task_title"');
    expect(html).toContain('name="task_instructions"');
    expect(html).toContain('data-plan-remove');
});

test('plan task is read-first with retained fields in an explicit editor', () => {
    const html = render(ctx, null, { task: { id: 't1', title: '<Build>', instructions: '<Do it>', status: 'pending' } });
    expect(html).toContain('inspector-row');
    expect(html).not.toContain('inspector-surface-row');
    expect(html).toContain('&lt;Do it&gt;</p>');
    expect(html).toContain('data-inspector-disclosure="task-edit-t1"');
    expect(html).toContain('>Edit task</summary>');
    expect(html).not.toMatch(/<details[^>]*\sopen(?:\s|>)/);
    expect(html).toContain('name="task_instructions"');
});

test('only pending tasks expose reorder and remove, new tasks open their editor', () => {
    for (const status of ['active', 'done']) {
        const html = render(ctx, null, { task: { id: 't1', status } });
        expect(html).not.toContain('data-plan-move');
        expect(html).not.toContain('data-plan-remove');
    }
    const html = render(ctx, null, { task: { id: 'new', status: 'pending' }, autofocus: true });
    expect(html.match(/<details[^>]*\sopen(?:\s|>)/g)).toHaveLength(2);
    expect(html).toContain('autofocus');
    expect(html).toContain('data-plan-move="up"');
});
