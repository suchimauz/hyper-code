import { describe, test, expect } from 'bun:test';
import hn from '../../../hackernews/src/hackernews/$route__GET';
import pubs from '../../../substack/src/substack/$route__GET';
import publication from '../../../substack/src/substack/$route_$key_GET';
import inbox from './$route__GET';
import message from './$route_$id_GET';

const routes = [hn, pubs, publication, inbox, message];
const session = { user: { id: 'owner' } } as unknown as Session;
const opts = (path: string, json = true) => ({ req: new Request(`http://localhost${path}`, { headers: json ? { accept: 'application/json' } : {} }), params: { key: 'one', id: 'a' } });
describe('authenticated native reader contracts', () => {
  test('rejects anonymous reads before accessing any data', async () => {
    for (const route of routes) {
      const response = await route({} as Context, null, opts('/'));
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });
  test('redirects legacy HTML URLs without querying data', async () => {
    for (const [route, path, page] of [[hn, '/hackernews?feed=best', 'hackernews'], [pubs, '/substack', 'substack'], [publication, '/substack/one', 'substack'], [inbox, '/inbox?view=quarantine&q=test', 'inbox'], [message, '/inbox/a?direction=out', 'inbox']] as const) {
      const response = await route({} as Context, session, opts(path, false));
      expect(response.status).toBe(303);
      const url = new URL(response.headers.get('location')!, 'http://localhost');
      expect(url.searchParams.get('view')).toBe(`extension:readers/${page}`);
      if (route === message) expect(url.searchParams.get('direction')).toBe('out');
      if (route === inbox) expect(url.searchParams.get('mailView')).toBe('quarantine');
    }
  });
  test('returns story data and varies on Accept', async () => {
    const ctx = { fns: { hackernews: { listFeeds: async () => [{ key: 'front' }], stories: async () => [{ id: 1 }] } } } as unknown as Context;
    const response = await hn(ctx, session, opts('/hackernews'));
    expect(response.headers.get('vary')).toBe('Accept');
    expect(await response.json()).toEqual({ feed: 'front', feeds: [{ key: 'front' }], stories: [{ id: 1 }] });
  });
  test('returns 404 for missing publication and message', async () => {
    const ctx = { fns: { substack: { list: async () => [] }, inbox: { list: async () => [] } } } as unknown as Context;
    expect((await publication(ctx, session, opts('/substack/one'))).status).toBe(404);
    expect((await message(ctx, session, opts('/inbox/a'))).status).toBe(404);
  });
});
