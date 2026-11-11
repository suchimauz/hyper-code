import { expect, test } from 'bun:test';
import controlScript from './controlScript';

test('compatibility control script parses without the retired chat tick bridge', async () => {
    const script = await controlScript({} as Context, null, {});
    expect(() => new Function(script)).not.toThrow();
    for (const retired of ['mauzcode-tick', 'msg-tail', 'agent.event_appended']) {
        expect(script).not.toContain(retired);
    }
    expect(script).toContain("name: 'ui-control', types: ['ui.navigate', 'ui.notify', 'ui.eval', 'ui.action', 'eval']");
    for (const retained of [
        "ev.type === 'ui.navigate'", "window.location.assign(ev.path)",
        "ev.type === 'ui.notify'", 'notify(ev)',
        "ev.type === 'ui.eval'", 'void handleEval(ev)',
        "ev.type === 'ui.action'", 'void handleAction(ev)',
        "ev.type === 'eval'", 'if (!window.page) return;',
        "fetch('/ui/eval/result'", "fetch('/screen/result'",
        'await postResult({ id: ev.id, ok: true, value })',
        'await postResult({ id: ev.id, ok: false, error: String(error?.message ?? error) })',
        'body = { id: ev.id, value: value === undefined ? null : value }',
        'body = { id: ev.id, error: String(err) }',
    ]) expect(script).toContain(retained);
});
