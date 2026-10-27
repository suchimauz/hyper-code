import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import render from './renderAutomationEventHtml';

const ctx = {} as Context;
test('scheduled prompt is collapsed, complete and escaped with native disclosure', async () => {
    const text = '<script>alert(1)</script>\n' + 'Полный текст '.repeat(3000);
    const w = new Window();
    w.document.body.innerHTML = await render(ctx, null, { event: { type: 'wake_up', reason: text, triggerId: '<id>' } });
    const card = w.document.querySelector('details')!;
    expect(card.hasAttribute('open')).toBe(false);
    expect(card.querySelector('summary')!.textContent).toBe('Запуск по расписанию');
    expect(card.querySelector('pre')!.textContent).toBe(text);
    expect(card.querySelector('script')).toBeNull();
    expect(card.querySelector('.service-meta')!.textContent).toBe('Расписание: <id>');
    expect(card.querySelector('[data-service-collapse]')!.getAttribute('type')).toBe('button');
    await w.happyDOM.close();
});
test('explicit schedule metadata supports durable user events and legacy event labels', async () => {
    for (const type of ['user', 'user_message']) {
        expect(await render(ctx, null, { event: { type, automationKind: 'scheduled', text: 'prompt' } })).toContain('prompt');
        expect(await render(ctx, null, { event: { type, text: 'prompt' } })).toBe('');
    }
    expect(await render(ctx, null, { event: { type: 'wake_up', watchId: 'watch', reason: 'condition' } })).toBe('');
    expect(await render(ctx, null, { event: { type: 'other' } })).toBe('');
    expect(await render(ctx, null, { event: { type: 'wake_up', summary: 'legacy' } })).toContain('legacy');
});
