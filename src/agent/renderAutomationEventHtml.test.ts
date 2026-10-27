import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import render from './renderAutomationEventHtml';

const ctx = {} as Context;
test('cron snapshot, ID and preview are visible while closed; original stays complete and escaped', async () => {
    const text = '\n<script>alert(1)</script>\n' + 'Полный текст '.repeat(3000);
    const w = new Window();
    try {
        w.document.body.innerHTML = await render(ctx, null, { event: { type: 'wake_up', reason: text, triggerId: '<id>', triggerKind:'cron', cronExpression:'0 9 * * 1-5', timezone:'Europe/Moscow', ts:1793096938882 } });
        const card = w.document.querySelector('details')!, summary=card.querySelector('summary')!;
        expect(card.open).toBe(false);
        expect(summary.querySelector('.service-title')!.textContent).toBe('Запуск по расписанию');
        expect(summary.textContent).toContain('ID задачи <id>');
        expect(summary.textContent).toContain('Cron 0 9 * * 1-5');
        expect(summary.textContent).toContain('Europe/Moscow');
        expect(summary.querySelector('time')!.getAttribute('datetime')).toBe(new Date(1793096938882).toISOString());
        expect(summary.querySelector('.service-preview')!.textContent).toBe(text.slice(0,1000));
        expect(card.querySelector('pre')!.textContent).toBe(text);
        expect(card.querySelector('script')).toBeNull();
        expect(card.querySelector('[data-service-collapse]')!.getAttribute('type')).toBe('button');
    } finally { await w.happyDOM.close(); }
});
test('explicit scheduled user metadata works; watches and ordinary messages are not schedules', async () => {
    for (const type of ['user', 'user_message']) {
        expect(await render(ctx, null, { event: { type, automationKind: 'scheduled', text: 'prompt' } })).toContain('Запуск по расписанию');
        expect(await render(ctx, null, { event: { type, text: 'prompt' } })).toBe('');
    }
    expect(await render(ctx, null, { event: { type: 'wake_up', watchId: 'watch', reason: 'condition' } })).toBe('');
    expect(await render(ctx, null, { event: { type: 'wake_up', triggerKind: 'watch', reason: 'condition' } })).toBe('');
    expect(await render(ctx, null, { event: { type: 'other' } })).toBe('');
});
test('one-time and legacy events never fabricate cron or time zone', async () => {
    const once = await render(ctx, null, { event: {type:'wake_up',triggerKind:'at',triggerId:'wake-1',reason:'reminder',cronExpression:'stale'} });
    expect(once).toContain('Разовый запуск');expect(once).not.toContain('Cron');expect(once).not.toContain('stale');expect(once).not.toContain('datetime=');
    const legacy=await render(ctx,null,{event:{type:'wake_up',summary:'legacy'}});
    expect(legacy).toContain('Автоматический запуск');expect(legacy).toContain('Тип запуска не сохранён');expect(legacy).toContain('legacy');expect(legacy).not.toContain('Cron');expect(legacy).not.toContain('Europe/');
});
test('explicit original prompt wins over summary and invalid times are omitted', async () => {
    const w=new Window();try {
        w.document.body.innerHTML=await render(ctx,null,{event:{type:'wake_up',triggerKind:'cron',prompt:'\noriginal',reason:'reason',ts:NaN,cronExpression:'<cron>',timezone:'<zone>'}});
        expect(w.document.querySelector('pre')!.textContent).toBe('\noriginal');expect(w.document.querySelector('time')).toBeNull();expect(w.document.querySelector('cron')).toBeNull();expect(w.document.querySelector('zone')).toBeNull();
    } finally {await w.happyDOM.close();}
});
