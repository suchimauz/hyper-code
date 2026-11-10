import { expect, test } from 'bun:test';
import login from './$route_login_GET';
import setup from './$route_setup_GET';

const owner = { name: 'Owner', email: 'owner@example.test', hasPassword: true, canSignIn: true, configuredAt: null };
function context(overrides: Record<string, unknown> = {}): any {
  return { env: { USER: 'Local' }, fns: { auth: {
    listUsers: async () => [owner], password: async () => null,
    googleConfig: async () => null, oidcConfig: async () => null, oidcOnly: async () => false,
    page: ({ body }: { body: string }) => new Response(body), ...overrides,
  }, procs: { ui: { escape: ({ text }: { text: string }) => Bun.escapeHTML(text) } } } };
}
const request = (path: string, json = true) => ({ req: new Request('https://mauzcode.test/auth/' + path, { headers: { accept: json ? 'application/json' : 'text/html' } }), params: {} });

test('login JSON contains public presentation only and preserves next', async () => {
  const response = await login(context({ googleConfig: async () => ({ domain: 'test', clientSecret: 'SECRET' }) }), null, request('login?next=%2Fauth%2Fmobile%2Fcomplete'));
  expect(response.headers.get('cache-control')).toBe('no-store');
  const model = await response.json() as { next: string; showPassword: boolean; needsEmail: boolean; google: { domain: string } };
  expect(model.next).toBe('/auth/mobile/complete');
  expect(model.showPassword).toBe(true);
  expect(model.needsEmail).toBe(false);
  expect(model.google).toEqual({ domain: 'test' });
  expect(JSON.stringify(model)).not.toContain('SECRET');
});
test('multi-user and legacy password presentations match existing login forms', async () => {
  const multi = await login(context({ listUsers: async () => [owner, owner] }), null, request('login?error=1'));
  expect(await multi.json()).toMatchObject({ needsEmail: true, error: 'Invalid email or password.' });
  const legacy = await login(context({ listUsers: async () => [], password: async () => 'not-exposed' }), null, request('login'));
  expect(await legacy.json()).toMatchObject({ showPassword: true, needsEmail: false });
});
test('OIDC-only does not expose Google or password sign-in', async () => {
  const response = await login(context({ oidcOnly: async () => true, googleConfig: async () => ({ domain: 'hidden' }) }), null, request('login'));
  expect(await response.json()).toMatchObject({ showPassword: false, google: null, oidc: null, providerUnavailable: true });
});
test('JSON negotiation preserves login availability redirect', async () => {
  for (const json of [true, false]) {
    const response = await login(context({ listUsers: async () => [] }), null, request('login', json));
    expect(response.status).toBe(303); expect(response.headers.get('location')).toBe('/auth/setup');
  }
});
test('setup public model preserves existing-password ownership input', async () => {
  const response = await setup(context(), null, request('setup?error=Wrong'));
  expect(await response.json()).toEqual({ kind: 'setup', name: 'Local', email: owner.email, needsCurrent: true, error: 'Wrong' });
  expect(response.headers.get('cache-control')).toBe('no-store');
});
test('setup redirects are identical for HTML and JSON and never disclose a completed owner', async () => {
  for (const json of [true, false]) for (const [overrides, location] of [
    [{ oidcOnly: async () => true }, '/auth/login'],
    [{ listUsers: async () => [{ ...owner, configuredAt: 1 }] }, '/'],
    [{ listUsers: async () => [owner, owner] }, '/'],
    [{ listUsers: async () => [], password: async () => 'legacy' }, '/auth/login'],
  ] as const) {
    const response = await setup(context(overrides), null, request('setup', json));
    expect(response.status).toBe(303); expect(response.headers.get('location')).toBe(location);
  }
});
