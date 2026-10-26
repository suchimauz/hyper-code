import { expect, test } from 'bun:test';
import quotaCards from './quotaCards';

type Account = Parameters<typeof quotaCards>[2]['account'];
const render = (account: Partial<Account> = {}, now?: number) => quotaCards({} as Context, null, {
    account: { available: true, usedPercent: null, resetsAt: null, ...account }, now,
});

test('reported windows keep real labels and replace aggregate usage', async () => {
    const html = await render({ usedPercent: 99, windows: {
        primary: { usedPercent: 12, windowMinutes: 300 }, secondary: { usedPercent: 34, windowMinutes: 10080 }, tertiary: { usedPercent: 56, windowMinutes: 43200 },
    } });
    for (const text of ['5 часов', 'Неделя', 'Месяц', '12%', '34%', '56%', 'Израсходовано']) expect(html).toContain(text);
    expect(html.match(/class="llm-quota-card /g)).toHaveLength(3);
    expect(html).not.toContain('99%');
    expect(html).not.toContain('Текущий лимит');
});

test('Codex weekly-only primary is weekly, never a fabricated five-hour limit', () => {
    // Real /wham/usage shape: primary_window.limit_window_seconds=604800, secondary_window=null.
    const html = render({ windows: { primary: { usedPercent: 41, windowMinutes: 604800 / 60 } } });
    expect(html).toContain('Неделя');
    expect(html).toContain('41%');
    expect(html).not.toContain('5 часов');
    expect(html).not.toContain('Месяц');
    expect(html.match(/class="llm-quota-card /g)).toHaveLength(1);
});

test('period labels follow durations even when slots are reversed or not standard', () => {
    const html = render({ windows: { primary: { usedPercent: 41, windowMinutes: 10080 }, secondary: { usedPercent: 12, windowMinutes: 300 } } });
    expect(html.indexOf('Неделя')).toBeLessThan(html.indexOf('5 часов'));
    for (const [windowMinutes, label] of [[60, '1 ч'], [1440, '1 дн.'], [90, '90 мин']] as const) {
        expect(render({ windows: { primary: { usedPercent: 1, windowMinutes } } })).toContain(label);
    }
    for (const windowMinutes of [undefined, null, 0, -1, NaN, Infinity]) {
        const unknown = render({ windows: { primary: { usedPercent: 1, windowMinutes }, secondary: { usedPercent: 2, windowMinutes } } });
        expect(unknown).toContain('Период неизвестен');
        expect(unknown).not.toContain('5 часов');
        expect(unknown).not.toContain('Неделя');
    }
});

test('aggregate fallback never guesses a period, including empty windows', async () => {
    for (const windows of [undefined, null, {}]) {
        const html = await render({ usedPercent: 0, windows });
        expect(html).toContain('Текущий лимит');
        expect(html).toContain('>0%</div>');
        expect(html).not.toContain('5 часов');
    }
});

test('missing and untrustworthy usage stays unknown regardless of availability', async () => {
    for (const available of [true, false]) for (const usedPercent of [null, -1, NaN, Infinity, 100.01]) {
        const html = await render({ available, usedPercent });
        expect(html).toContain('>—</div>');
        expect(html).toContain('Нет данных');
        expect(html).not.toContain('>0%</div>');
        expect(html).not.toContain('aria-valuenow');
        expect(html).not.toContain('text-success');
    }
    const html = await render({ usedPercent: 42, windows: { primary: { usedPercent: NaN } } });
    expect(html).toContain('Период неизвестен');
    expect(html).not.toContain('5 часов');
    expect(html).not.toContain('42%');
    expect(html).not.toContain('Неделя');
});

test('default and custom thresholds have inclusive severity boundaries', async () => {
    for (const [usedPercent, color] of [[0, 'success'], [29.9, 'success'], [30, 'warning'], [60, 'critical'], [75, 'error'], [100, 'error']] as const) {
        expect(await render({ usedPercent })).toContain('text-' + color);
    }
    for (const [usedPercent, color] of [[9, 'success'], [10, 'warning'], [20, 'critical'], [40, 'error']] as const) {
        expect(await render({ usedPercent, thresholds: { warnAt: 10, criticalAt: 20, alertAt: 40 } })).toContain('text-' + color);
    }
    expect(await render({ usedPercent: 65, thresholds: { warnAt: 30, alertAt: 80 } })).toContain('text-critical');
});

test('reset timestamps offer viewer localization with explicit UTC fallback', async () => {
    const stamp = Date.parse('2026-08-12T09:30:00.000Z');
    const html = await render({ windows: { primary: { usedPercent: 25, resetsAt: stamp } } }, stamp - 1);
    expect(html).toContain('<time data-llm-local-time datetime="2026-08-12T09:30:00.000Z">2026-08-12 09:30 UTC</time>');
    expect(html).not.toContain('ожидается обновление');
    expect(await render({ resetsAt: stamp }, stamp)).toContain('ожидается обновление');
    for (const resetsAt of [null, 0, -1, NaN, Infinity, 1e20]) {
        const invalid = await render({ resetsAt });
        expect(invalid).toContain('Сброс: нет данных');
        expect(invalid).not.toContain('<time');
    }
});

test('markup exposes required hooks and valid accessible meter synchronously', () => {
    const html = render({ usedPercent: 12.5 });
    expect(typeof html).toBe('string');
    for (const name of ['grid', 'card', 'label', 'value', 'meter', 'reset']) expect(html).toContain('llm-quota-' + name);
    expect(html).toContain('aria-valuenow="12.5"');
    expect(html).toContain('<span style="width:12.5%;background:currentColor">');
});

test('runtime malformed values cannot inject HTML or style attributes', async () => {
    const payload = '\"><img src=x onerror=alert(1)>';
    const html = await render({ usedPercent: payload as unknown as number, resetsAt: payload as unknown as number,
        thresholds: { warnAt: payload as unknown as number, alertAt: NaN },
    });
    expect(html).not.toContain(payload);
    expect(html).not.toContain('<img');
    expect(html).toContain('>—</div>');
    expect(html).toContain('Сброс: нет данных');
});
