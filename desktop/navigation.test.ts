import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
const attachNavigation = require('./navigation.cjs');
function fixture() {
  let url = 'https://hyper.test/';
  const contents = Object.assign(new EventEmitter(), { getURL: () => url });
  const failures: string[] = [], pages: any[] = [];
  let ready = 0;
  const navigation = attachNavigation({ contents, origin: 'https://hyper.test', fail: (reason: string) => failures.push(reason),
    ready: () => { ready++; }, pageError: (...args: any[]) => pages.push(args) });
  function navigate(code = 200, target = 'https://hyper.test/') {
    url = target;
    contents.emit('did-start-navigation', {}, url, false, true);
    contents.emit('did-navigate', {}, url, code);
    contents.emit('did-finish-load');
  }
  function failure(code = -105, main = true) { contents.emit('did-fail-load', {}, code, 'failed', url, main); }
  return { contents, navigation, navigate, failure, failures, pages, get ready() { return ready; } };
}
describe('desktop navigation errors', () => {
  for (const code of [401, 403, 404, 500]) {
    test(`initial HTTP ${code} still reports connection failure`, () => {
      const f = fixture(); f.navigate(code); expect(f.failures).toEqual([`HTTP ${code}.`]); expect(f.ready).toBe(0); expect(f.pages).toEqual([]);
    });
    test(`later HTTP ${code} keeps connection and original response`, () => {
      const f = fixture(); f.navigate(); f.navigate(code, 'https://hyper.test/redmine401');
      expect(f.failures).toEqual([]); expect(f.ready).toBe(1); expect(f.pages).toEqual([[`HTTP ${code}.`, { http: true }]]);
      f.failure(-379); expect(f.pages).toHaveLength(1);
      f.navigate(); expect(f.failures).toEqual([]); expect(f.ready).toBe(1);
    });
  }
  test('login page and redirects within origin can finish the initial connection', () => {
    const f = fixture(); f.navigate(200, 'https://hyper.test/auth?returnTo=%2F'); expect(f.ready).toBe(1); expect(f.failures).toEqual([]);
  });
  for (const code of [-105, -102, -202, -379]) {
    test(`initial network/TLS/load failure ${code} fails once`, () => {
      const f = fixture(); f.failure(code); f.navigation.failedLoad(code, 'promise rejection'); f.contents.emit('did-finish-load');
      expect(f.failures).toHaveLength(1); expect(f.ready).toBe(0);
    });
    test(`later network/TLS/load failure ${code} allows retry without setup`, () => {
      const f = fixture(); f.navigate(); f.failure(code); expect(f.failures).toEqual([]); expect(f.pages).toHaveLength(1);
      f.navigate(); expect(f.ready).toBe(1);
    });
  }
  test('aborted navigations and failed subresources do not disconnect', () => {
    const f = fixture(); f.failure(-3); f.failure(-105, false); f.navigate();
    f.failure(-3); f.failure(-105, false); expect(f.ready).toBe(1); expect(f.failures).toEqual([]); expect(f.pages).toEqual([]);
  });
  test('uncommitted, cross-origin and fragment loads do not count as connection success', () => {
    const f = fixture(); f.contents.emit('did-finish-load'); expect(f.ready).toBe(0);
    f.navigate(200, 'https://evil.test/'); expect(f.ready).toBe(0);
    f.contents.emit('did-start-navigation', {}, 'https://hyper.test/#x', true, true); f.contents.emit('did-finish-load'); expect(f.ready).toBe(0);
  });
  test('renderer crash before initial load fails; after load preserves connection for retry', () => {
    const initial = fixture(); initial.contents.emit('render-process-gone', {}, { reason: 'crashed' }); expect(initial.failures).toHaveLength(1);
    const later = fixture(); later.navigate(); later.contents.emit('render-process-gone', {}, { reason: 'crashed' });
    expect(later.failures).toEqual([]); expect(later.pages[0][0]).toContain('crashed'); later.navigate(); expect(later.ready).toBe(1);
  });
  test('initial timeout reports once and late finish cannot dismiss setup', () => {
    const f = fixture(); f.navigation.failure('timeout'); f.navigate(); expect(f.failures).toEqual(['timeout']); expect(f.ready).toBe(0);
  });
});
