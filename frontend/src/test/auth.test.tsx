import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthForm, type AuthModel } from '../AuthPage';

const login: AuthModel = { kind: 'login', next: '/auth/mobile/complete?state=a&b=c', message: 'Sign in', error: '<script>bad</script>', showPassword: true, needsEmail: true, google: { domain: 'example.test' }, oidc: { label: 'Work' }, providerUnavailable: false };
test('login uses native POST and existing provider and mobile redirect transports', () => {
  const html = renderToStaticMarkup(<AuthForm model={login} />);
  expect(html).toContain('action="/auth/login"'); expect(html).toContain('method="post"');
  expect(html).toContain('name="next"'); expect(html).toContain('name="email"');
  expect(html).toContain('autoComplete="current-password"');
  expect(html).toContain('/auth/oidc?next=%2Fauth%2Fmobile%2Fcomplete');
  expect(html).toContain('/auth/google?next=');
  expect(html).not.toContain('<script>'); expect(html).toContain('role="alert"');
});
test('OIDC-only renders no credential form', () => {
  const html = renderToStaticMarkup(<AuthForm model={{ ...login, showPassword: false, google: null }} />);
  expect(html).not.toContain('<form'); expect(html).not.toContain('name="password"');
  expect(html).toContain('Sign in with Work');
});
test('setup preserves current-password requirement without replacement password', () => {
  const html = renderToStaticMarkup(<AuthForm model={{ kind: 'setup', name: 'Owner', email: '', needsCurrent: true, error: null }} />);
  expect(html).toContain('action="/auth/setup"'); expect(html).toContain('name="current"');
  expect(html).not.toContain('name="password"'); expect(html).toContain('required=""');
});
test('new owner setup keeps password optional and eight-character minimum', () => {
  const html = renderToStaticMarkup(<AuthForm model={{ kind: 'setup', name: '', email: '', needsCurrent: false, error: null }} />);
  expect(html).not.toContain('name="current"'); expect(html).toContain('minLength="8"');
  expect(html).toContain('autoComplete="new-password"'); expect(html).toContain('without one, MauzCode opens without sign-in');
});
